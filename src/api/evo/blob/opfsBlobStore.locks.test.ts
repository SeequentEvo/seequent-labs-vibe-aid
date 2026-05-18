import { describe, it, expect, beforeEach } from "vitest";
import { OpfsBlobStore } from "./opfsBlobStore";
import { asBlobRef } from "./types";
import type { CacheScope } from "./types";
import type { LocksAdapter } from "./opfsLocks";
import type { OrgId, WorkspaceId } from "@/types/ids";

/* -------------------------------------------------------------------- */
/* Fake OPFS — same shape as opfsBlobStore.test.ts but tracks mtime    */
/* and counts file writes per file path.                                */
/* -------------------------------------------------------------------- */

interface WriteCounter {
  total: number;
  byName: Map<string, number>;
}

class FakeFile {
  readonly kind = "file";
  bytes: Uint8Array = new Uint8Array(0);
  lastModified = 0;
  name: string;
  constructor(name: string) {
    this.name = name;
  }
}

type FakeEntry = FakeFile | FakeDir;

class FakeDir {
  readonly kind = "directory";
  readonly children = new Map<string, FakeEntry>();
  name: string;
  constructor(name: string) {
    this.name = name;
  }

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FakeDir> {
    const existing = this.children.get(name);
    if (existing && existing.kind === "directory") return existing;
    if (existing) throw new Error(`Not a directory: ${name}`);
    if (!options?.create) {
      throw new DOMException(`Not found: ${name}`, "NotFoundError");
    }
    const dir = new FakeDir(name);
    this.children.set(name, dir);
    return dir;
  }

  async getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FakeFileHandle> {
    const existing = this.children.get(name);
    if (existing && existing.kind === "file") {
      return new FakeFileHandle(existing, writes);
    }
    if (existing) throw new Error(`Not a file: ${name}`);
    if (!options?.create) {
      throw new DOMException(`Not found: ${name}`, "NotFoundError");
    }
    const file = new FakeFile(name);
    this.children.set(name, file);
    return new FakeFileHandle(file, writes);
  }

  async removeEntry(
    name: string,
    options?: { recursive?: boolean },
  ): Promise<void> {
    const existing = this.children.get(name);
    if (!existing) {
      throw new DOMException(`Not found: ${name}`, "NotFoundError");
    }
    if (
      existing.kind === "directory" &&
      existing.children.size > 0 &&
      !options?.recursive
    ) {
      throw new DOMException("Directory not empty", "InvalidModificationError");
    }
    this.children.delete(name);
  }
}

class FakeFileHandle {
  readonly kind = "file";
  private readonly file: FakeFile;
  private readonly counter: WriteCounter;
  constructor(file: FakeFile, counter: WriteCounter) {
    this.file = file;
    this.counter = counter;
  }

  async getFile(): Promise<File> {
    const blob = new Blob([new Uint8Array(this.file.bytes)]);
    // Build a real File so `lastModified` is a number.
    return new File([blob], this.file.name, {
      lastModified: this.file.lastModified,
    });
  }

  async createWritable(): Promise<FakeWritable> {
    return new FakeWritable(this.file, this.counter);
  }
}

class FakeWritable {
  private buffer: Uint8Array = new Uint8Array(0);
  private position = 0;
  private readonly file: FakeFile;
  private readonly counter: WriteCounter;
  constructor(file: FakeFile, counter: WriteCounter) {
    this.file = file;
    this.counter = counter;
  }

  async write(
    data:
      | ArrayBuffer
      | ArrayBufferView
      | Blob
      | string
      | { data: unknown; position?: number; type?: string },
  ): Promise<void> {
    let payload: Uint8Array;
    let pos = this.position;
    if (
      typeof data === "object" &&
      data !== null &&
      "type" in (data as Record<string, unknown>)
    ) {
      const cmd = data as {
        type: string;
        data?: ArrayBuffer | ArrayBufferView | string;
        position?: number;
      };
      if (cmd.type === "write") {
        if (cmd.position !== undefined) pos = cmd.position;
        payload = toBytes(cmd.data ?? new Uint8Array(0));
      } else if (cmd.type === "seek") {
        this.position = cmd.position ?? 0;
        return;
      } else if (cmd.type === "truncate") {
        const n = cmd.position ?? 0;
        this.buffer = this.buffer.slice(0, n);
        return;
      } else {
        return;
      }
    } else {
      payload = toBytes(data as ArrayBuffer | ArrayBufferView | string);
    }
    const end = pos + payload.byteLength;
    if (end > this.buffer.byteLength) {
      const grown = new Uint8Array(end);
      grown.set(this.buffer, 0);
      this.buffer = grown;
    }
    this.buffer.set(payload, pos);
    this.position = end;
  }

  async close(): Promise<void> {
    this.file.bytes = this.buffer;
    this.file.lastModified = ++mtimeClock;
    this.counter.total += 1;
    this.counter.byName.set(
      this.file.name,
      (this.counter.byName.get(this.file.name) ?? 0) + 1,
    );
  }

  async abort(): Promise<void> {
    /* no-op */
  }

  async seek(position: number): Promise<void> {
    this.position = position;
  }

  async truncate(size: number): Promise<void> {
    this.buffer = this.buffer.slice(0, size);
  }
}

function toBytes(
  data: ArrayBuffer | ArrayBufferView | Blob | string | unknown,
): Uint8Array {
  if (typeof data === "string") return new TextEncoder().encode(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return new Uint8Array(0);
}

let writes: WriteCounter = { total: 0, byName: new Map() };
let mtimeClock = 0;

const makeRoot = (): FileSystemDirectoryHandle =>
  new FakeDir("root") as unknown as FileSystemDirectoryHandle;

/* -------------------------------------------------------------------- */
/* Fake locks adapter — records lock requests and serialises by name.   */
/* -------------------------------------------------------------------- */

interface LockEvent {
  name: string;
  acquired: number;
  released: number;
}

class RecordingLocksAdapter implements LocksAdapter {
  readonly events: LockEvent[] = [];
  /** Currently-held locks by name (for assertions on serialisation). */
  readonly held = new Map<string, number>();
  private readonly chains = new Map<string, Promise<unknown>>();
  private clock = 0;

  private acquire<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(name) ?? Promise.resolve();
    const next = prev.then(async () => {
      const event: LockEvent = {
        name,
        acquired: ++this.clock,
        released: -1,
      };
      this.events.push(event);
      this.held.set(name, (this.held.get(name) ?? 0) + 1);
      try {
        return await fn();
      } finally {
        this.held.set(name, (this.held.get(name) ?? 1) - 1);
        if (this.held.get(name) === 0) this.held.delete(name);
        event.released = ++this.clock;
      }
    });
    const completion: Promise<unknown> = next.then(
      () => undefined,
      () => undefined,
    );
    this.chains.set(name, completion);
    return next;
  }

  withIndex<T>(fn: () => Promise<T>): Promise<T> {
    return this.acquire("evo-blob-cache:index", fn);
  }

  withWrite<T>(key: string, fn: () => Promise<T>): Promise<T> {
    return this.acquire(`evo-blob-cache:write:${key}`, fn);
  }

  /** Assert that two named lock spans on the SAME name did not overlap. */
  assertSerialisedFor(name: string): void {
    const evs = this.events.filter((e) => e.name === name);
    for (let i = 1; i < evs.length; i += 1) {
      const cur = evs[i];
      const prev = evs[i - 1];
      if (!cur || !prev) continue;
      expect(cur.acquired).toBeGreaterThan(prev.released);
    }
  }
}

/* -------------------------------------------------------------------- */
/* Fixtures                                                             */
/* -------------------------------------------------------------------- */

const ORG = "org-a" as unknown as OrgId;
const WS = "ws-1" as unknown as WorkspaceId;
const scope = (): CacheScope => ({
  orgId: ORG,
  workspaceId: WS,
  kind: "geoscience-object",
});
const ref = (s: string) => asBlobRef(s);
const bytes = (s: string) => new TextEncoder().encode(s);
const flush = () => new Promise((r) => setTimeout(r, 80));

let root: FileSystemDirectoryHandle;
let locks: RecordingLocksAdapter;

beforeEach(() => {
  root = makeRoot();
  locks = new RecordingLocksAdapter();
  writes = { total: 0, byName: new Map() };
  mtimeClock = 0;
});

/* -------------------------------------------------------------------- */
/* Tests                                                                */
/* -------------------------------------------------------------------- */

describe("OpfsBlobStore — multi-tab safety", () => {
  it("acquires the named index lock around mutations", async () => {
    const store = await OpfsBlobStore.create({ rootDir: root, locks });
    await store.put(scope(), ref("a"), bytes("hi"));
    expect(
      locks.events.some((e) => e.name === "evo-blob-cache:index"),
    ).toBe(true);
  });

  it("acquires the per-ref write lock and short-circuits a duplicate put", async () => {
    const store = await OpfsBlobStore.create({ rootDir: root, locks });
    const s = scope();
    const r = ref("dup");

    const writesBefore = writes.total;
    const [, ] = await Promise.all([
      store.put(s, r, bytes("payload")),
      store.put(s, r, bytes("payload")),
    ]);

    // Per-ref write lock name is content-keyed.
    const writeLockName = `evo-blob-cache:write:${ORG}/${WS}/geoscience-object/dup`;
    locks.assertSerialisedFor(writeLockName);

    // Only one blob write to the data file (the second put short-circuited
    // because `has` returned true after the first finished).
    const blobWrites = writes.byName.get("dup") ?? 0;
    expect(blobWrites).toBe(1);
    // Index file may have been written more than once but the data file
    // for `dup` was only written once, proving the second put short-circuited.
    expect(writes.total).toBeGreaterThan(writesBefore);
  });

  it("two puts on different refs do not share a per-ref lock", async () => {
    const store = await OpfsBlobStore.create({ rootDir: root, locks });
    const s = scope();
    await Promise.all([
      store.put(s, ref("a"), bytes("aaaa")),
      store.put(s, ref("b"), bytes("bbbb")),
    ]);

    // Both per-ref write locks exist, distinct names, never serialised
    // against each other (different lock names, by construction).
    const aName = `evo-blob-cache:write:${ORG}/${WS}/geoscience-object/a`;
    const bName = `evo-blob-cache:write:${ORG}/${WS}/geoscience-object/b`;
    const aEvts = locks.events.filter((e) => e.name === aName);
    const bEvts = locks.events.filter((e) => e.name === bName);
    expect(aEvts.length).toBe(1);
    expect(bEvts.length).toBe(1);

    // The shared index lock did serialise them — there should be at least
    // two non-overlapping index-lock spans, one per put.
    const indexSpans = locks.events.filter(
      (e) => e.name === "evo-blob-cache:index",
    );
    expect(indexSpans.length).toBeGreaterThanOrEqual(2);
    locks.assertSerialisedFor("evo-blob-cache:index");

    expect(writes.byName.get("a")).toBe(1);
    expect(writes.byName.get("b")).toBe(1);
  });

  it("reloads index from disk when another tab bumped its mtime", async () => {
    // Tab A populates and persists.
    const tabA = await OpfsBlobStore.create({ rootDir: root, locks });
    await tabA.put(scope(), ref("a"), bytes("from-a"));
    await flush();

    // Tab B opens the same root with a fresh adapter — observes A's entry.
    const locksB = new RecordingLocksAdapter();
    const tabB = await OpfsBlobStore.create({ rootDir: root, locks: locksB });
    expect(await tabB.has(scope(), ref("a"))).toBe(true);

    // Simulate "tab A" writing a new entry directly to index.json + bumping
    // mtime, after tab B already has its in-memory snapshot.
    const evo = (root as unknown as FakeDir).children.get(
      "evo-cache",
    ) as FakeDir;
    const v1 = evo.children.get("v1") as FakeDir;
    const indexFile = v1.children.get("index.json") as FakeFile;
    const newIndex = {
      version: 1,
      entries: [
        {
          orgId: ORG,
          workspaceId: WS,
          kind: "geoscience-object",
          ref: "a",
          sizeBytes: 6,
          lastAccessMs: Date.now(),
        },
        {
          orgId: ORG,
          workspaceId: WS,
          kind: "geoscience-object",
          ref: "from-other-tab",
          sizeBytes: 3,
          lastAccessMs: Date.now(),
        },
      ],
    };
    indexFile.bytes = new TextEncoder().encode(JSON.stringify(newIndex));
    indexFile.lastModified = ++mtimeClock; // newer than tab B's cached mtime

    // Next index-locked op on tab B must reload first and see the peer's entry.
    await tabB.delete(scope(), ref("a")); // any index-locked op will do
    expect(await tabB.has(scope(), ref("from-other-tab"))).toBe(true);
  });

  it("falls back when navigator.locks is unavailable: round-trip still works", async () => {
    const originalNavigator = globalThis.navigator as Navigator | undefined;
    const stripped =
      originalNavigator !== undefined
        ? new Proxy(originalNavigator, {
            has(target, prop) {
              if (prop === "locks") return false;
              return Reflect.has(target, prop);
            },
            get(target, prop, receiver) {
              if (prop === "locks") return undefined;
              return Reflect.get(target, prop, receiver) as unknown;
            },
          })
        : undefined;
    Object.defineProperty(globalThis, "navigator", {
      value: stripped,
      configurable: true,
    });
    try {
      // No `locks` option → store calls createLocksAdapter() which
      // detects the missing API and uses the fallback chain adapter.
      const store = await OpfsBlobStore.create({ rootDir: root });
      const s = scope();
      const r = ref("fallback");
      await store.put(s, r, bytes("hello"));
      expect(await store.has(s, r)).toBe(true);
      const blob = await store.openRead(s, r);
      expect(await blob.text()).toBe("hello");
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: originalNavigator,
        configurable: true,
      });
    }
  });
});
