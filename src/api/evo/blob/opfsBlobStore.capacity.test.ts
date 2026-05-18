import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpfsBlobStore } from "./opfsBlobStore";
import { asBlobRef, BlobStoreQuotaError } from "./types";
import type { BlobStoreEvents, CacheScope } from "./types";
import type { OrgId, WorkspaceId } from "@/types/ids";

/* -------------------------------------------------------------------- */
/* Fake OPFS — minimal in-memory implementation.                        */
/* -------------------------------------------------------------------- */

type FakeEntry = FakeFile | FakeDir;

class FakeFile {
  readonly kind = "file";
  bytes: Uint8Array = new Uint8Array(0);
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }
}

class FakeDir {
  readonly kind = "directory";
  readonly children = new Map<string, FakeEntry>();
  readonly name: string;
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
      return new FakeFileHandle(existing);
    }
    if (existing) throw new Error(`Not a file: ${name}`);
    if (!options?.create) {
      throw new DOMException(`Not found: ${name}`, "NotFoundError");
    }
    const file = new FakeFile(name);
    this.children.set(name, file);
    return new FakeFileHandle(file);
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
  constructor(file: FakeFile) {
    this.file = file;
  }

  async getFile(): Promise<Blob & { size: number }> {
    return new Blob([new Uint8Array(this.file.bytes)]) as Blob & {
      size: number;
    };
  }

  async createWritable(): Promise<FakeWritable> {
    return new FakeWritable(this.file);
  }
}

class FakeWritable {
  private buffer: Uint8Array = new Uint8Array(0);
  private position = 0;
  private readonly file: FakeFile;
  constructor(file: FakeFile) {
    this.file = file;
  }

  async write(data: ArrayBuffer | ArrayBufferView | string): Promise<void> {
    const payload = toBytes(data);
    const end = this.position + payload.byteLength;
    if (end > this.buffer.byteLength) {
      const grown = new Uint8Array(end);
      grown.set(this.buffer, 0);
      this.buffer = grown;
    }
    this.buffer.set(payload, this.position);
    this.position = end;
  }

  async close(): Promise<void> {
    this.file.bytes = this.buffer;
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

function toBytes(data: ArrayBuffer | ArrayBufferView | string): Uint8Array {
  if (typeof data === "string") return new TextEncoder().encode(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return new Uint8Array(0);
}

const makeRoot = (): FileSystemDirectoryHandle =>
  new FakeDir("root") as unknown as FileSystemDirectoryHandle;

/* -------------------------------------------------------------------- */
/* Fixtures                                                             */
/* -------------------------------------------------------------------- */

const ORG = "org-a" as unknown as OrgId;
const WS = "ws-1" as unknown as WorkspaceId;

const scope: CacheScope = { orgId: ORG, workspaceId: WS, kind: "file" };
const ref = (s: string) => asBlobRef(s);
const bytes = (n: number, fill = 0x61) => {
  const a = new Uint8Array(n);
  a.fill(fill);
  return a;
};

let root: FileSystemDirectoryHandle;
let originalEstimate: typeof navigator.storage.estimate | undefined;

beforeEach(() => {
  root = makeRoot();
  if (typeof navigator !== "undefined") {
    if (!("storage" in navigator) || navigator.storage === undefined) {
      Object.defineProperty(navigator, "storage", {
        value: {
          estimate: () => Promise.resolve({}),
        } as StorageManager,
        configurable: true,
      });
    } else if (typeof navigator.storage.estimate !== "function") {
      navigator.storage.estimate = (() =>
        Promise.resolve({})) as typeof navigator.storage.estimate;
    }
    originalEstimate = navigator.storage.estimate.bind(navigator.storage);
  }
});

afterEach(() => {
  if (originalEstimate && navigator.storage) {
    navigator.storage.estimate = originalEstimate;
  }
});

const stubEstimate = (
  result: StorageEstimate | (() => Promise<StorageEstimate>),
): void => {
  navigator.storage.estimate = (
    typeof result === "function"
      ? result
      : () => Promise.resolve(result)
  ) as typeof navigator.storage.estimate;
};

const disableEstimate = (): void => {
  navigator.storage.estimate = (() =>
    Promise.resolve({
      usage: 0,
      quota: Number.POSITIVE_INFINITY,
    })) as typeof navigator.storage.estimate;
};

/* -------------------------------------------------------------------- */
/* Tests                                                                */
/* -------------------------------------------------------------------- */

describe("OpfsBlobStore — capacity management", () => {
  it("auto-evicts oldest entries when put exceeds budget", async () => {
    disableEstimate();
    const store = await OpfsBlobStore.create({
      rootDir: root,
      budgetBytes: 10,
    });

    const evicted: string[] = [];
    store.on("evicted", (e) => evicted.push(`${String(e.ref)}:${e.reason}`));

    await store.put(scope, ref("a"), bytes(4));
    await new Promise((r) => setTimeout(r, 5));
    await store.put(scope, ref("b"), bytes(4));
    await new Promise((r) => setTimeout(r, 5));
    // Pushes total to 12 → must evict the oldest (a, 4 bytes).
    await store.put(scope, ref("c"), bytes(4));

    expect(await store.has(scope, ref("a"))).toBe(false);
    expect(await store.has(scope, ref("b"))).toBe(true);
    expect(await store.has(scope, ref("c"))).toBe(true);
    expect(evicted).toContain("a:lru-budget");
  });

  it("auto-evicts when openWrite reservation exceeds budget", async () => {
    disableEstimate();
    const store = await OpfsBlobStore.create({
      rootDir: root,
      budgetBytes: 10,
    });

    await store.put(scope, ref("a"), bytes(4));
    await new Promise((r) => setTimeout(r, 5));
    await store.put(scope, ref("b"), bytes(4));

    const stream = await store.openWrite(scope, ref("c"), 6);
    await stream.write(bytes(6));
    await stream.close();

    expect(await store.has(scope, ref("a"))).toBe(false);
    expect(await store.has(scope, ref("b"))).toBe(true);
    expect(await store.has(scope, ref("c"))).toBe(true);
  });

  it("emits budget-pressure with correct trigger and throttles within 1s", async () => {
    disableEstimate();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const store = await OpfsBlobStore.create({
        rootDir: root,
        budgetBytes: 10,
      });

      const events: BlobStoreEvents["budget-pressure"][] = [];
      store.on("budget-pressure", (e) => events.push(e));

      await store.put(scope, ref("a"), bytes(4));
      await store.put(scope, ref("b"), bytes(4));
      // First over-budget put → fires pressure (trigger 'budget').
      await store.put(scope, ref("c"), bytes(4));
      expect(events).toHaveLength(1);
      expect(events[0]?.trigger).toBe("budget");
      expect(events[0]?.bytesBudget).toBe(10);
      expect(events[0]?.bytesUsed).toBeLessThanOrEqual(10);

      // Second over-budget put within 1s — throttled.
      vi.advanceTimersByTime(500);
      await store.put(scope, ref("d"), bytes(4));
      expect(events).toHaveLength(1);

      // After the throttle window, the next pressure is allowed through.
      vi.advanceTimersByTime(600);
      await store.put(scope, ref("e"), bytes(4));
      expect(events).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws BlobStoreQuotaError when blob alone exceeds budget", async () => {
    disableEstimate();
    const store = await OpfsBlobStore.create({
      rootDir: root,
      budgetBytes: 10,
    });

    const errors: BlobStoreEvents["quota-error"][] = [];
    store.on("quota-error", (e) => errors.push(e));

    await expect(store.put(scope, ref("big"), bytes(20))).rejects.toBeInstanceOf(
      BlobStoreQuotaError,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.sizeBytes).toBe(20);

    await expect(store.openWrite(scope, ref("big2"), 30)).rejects.toBeInstanceOf(
      BlobStoreQuotaError,
    );
    expect(errors).toHaveLength(2);
  });

  it("evicts and emits browser-quota pressure when navigator.storage estimate crosses 0.9", async () => {
    stubEstimate({ usage: 95, quota: 100 });
    const store = await OpfsBlobStore.create({
      rootDir: root,
      budgetBytes: 1024,
    });

    const evicted: string[] = [];
    store.on("evicted", (e) => evicted.push(e.reason));
    const pressure: BlobStoreEvents["budget-pressure"][] = [];
    store.on("budget-pressure", (e) => pressure.push(e));

    await store.put(scope, ref("a"), bytes(4));
    await new Promise((r) => setTimeout(r, 5));
    await store.put(scope, ref("b"), bytes(4));

    expect(evicted.filter((r) => r === "lru-quota").length).toBeGreaterThan(0);
    const lastPressure = pressure[pressure.length - 1];
    expect(lastPressure?.trigger).toBe("browser-quota");
    expect(lastPressure?.quotaUsage).toBe(95);
    expect(lastPressure?.quotaCapacity).toBe(100);
  });

  it("ignores estimate() throwing (Safari) and continues", async () => {
    stubEstimate(() =>
      Promise.reject(new Error("not supported")),
    );
    const store = await OpfsBlobStore.create({
      rootDir: root,
      budgetBytes: 1024,
    });
    await expect(store.put(scope, ref("a"), bytes(4))).resolves.toBeUndefined();
    expect(await store.has(scope, ref("a"))).toBe(true);
  });

  it("does not evict an entry whose openWrite stream is still open", async () => {
    disableEstimate();
    const store = await OpfsBlobStore.create({
      rootDir: root,
      budgetBytes: 10,
    });

    // Reserve 'pinned' first (it will be the LRU candidate).
    const pinnedStream = await store.openWrite(scope, ref("pinned"), 4);
    await pinnedStream.write(bytes(4));
    // Stream intentionally NOT closed.

    await new Promise((r) => setTimeout(r, 5));
    await store.put(scope, ref("filler"), bytes(4));

    // This put pushes total to 12; eviction must skip the pinned entry and
    // evict 'filler' (the only unpinned candidate older than the new entry).
    await new Promise((r) => setTimeout(r, 5));
    await store.put(scope, ref("new"), bytes(4));

    expect(await store.has(scope, ref("pinned"))).toBe(true);
    expect(await store.has(scope, ref("new"))).toBe(true);
    // 'filler' was unpinned and oldest of the unpinned set.
    expect(await store.has(scope, ref("filler"))).toBe(false);

    // Cleanup
    await pinnedStream.close();
  });
});
