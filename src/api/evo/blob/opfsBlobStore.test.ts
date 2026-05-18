import { describe, it, expect, beforeEach } from "vitest";
import { OpfsBlobStore } from "./opfsBlobStore";
import { asBlobRef } from "./types";
import type { CacheScope } from "./types";
import type { OrgId, WorkspaceId } from "@/types/ids";

/* -------------------------------------------------------------------- */
/* Fake OPFS — in-memory implementation of the FileSystem* interfaces.  */
/* -------------------------------------------------------------------- */

type FakeEntry = FakeFile | FakeDir;

class FakeFile {
  readonly kind = "file";
  bytes: Uint8Array = new Uint8Array(0);
  name: string;
  constructor(name: string) {
    this.name = name;
  }
}

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

  async getFile(): Promise<Blob & { text(): Promise<string>; size: number }> {
    const bytes = this.file.bytes;
    const blob = new Blob([new Uint8Array(bytes)]);
    return blob as Blob & { text(): Promise<string>; size: number };
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

  async write(
    data: ArrayBuffer | ArrayBufferView | Blob | string | { data: unknown; position?: number; type?: string },
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

const makeRoot = (): FileSystemDirectoryHandle =>
  new FakeDir("root") as unknown as FileSystemDirectoryHandle;

/* -------------------------------------------------------------------- */
/* Test fixtures                                                        */
/* -------------------------------------------------------------------- */

const ORG_A = "org-a" as unknown as OrgId;
const ORG_B = "org-b" as unknown as OrgId;
const WS_1 = "ws-1" as unknown as WorkspaceId;
const WS_2 = "ws-2" as unknown as WorkspaceId;

const scope = (
  orgId: OrgId,
  workspaceId: WorkspaceId,
  kind: "geoscience-object" | "file" = "geoscience-object",
): CacheScope => ({ orgId, workspaceId, kind });

const ref = (s: string) => asBlobRef(s);
const bytes = (s: string) => new TextEncoder().encode(s);

const flush = () => new Promise((r) => setTimeout(r, 80));

let root: FileSystemDirectoryHandle;
beforeEach(() => {
  root = makeRoot();
});

/* -------------------------------------------------------------------- */
/* Tests                                                                */
/* -------------------------------------------------------------------- */

describe("OpfsBlobStore", () => {
  it("put then openRead round-trips bytes", async () => {
    const store = await OpfsBlobStore.create({ rootDir: root });
    const s = scope(ORG_A, WS_1);
    const r = ref("ref-1");
    await store.put(s, r, bytes("hello"));
    const blob = await store.openRead(s, r);
    expect(await blob.text()).toBe("hello");
  });

  it("has() reflects put and delete", async () => {
    const store = await OpfsBlobStore.create({ rootDir: root });
    const s = scope(ORG_A, WS_1);
    const r = ref("ref-1");
    expect(await store.has(s, r)).toBe(false);
    await store.put(s, r, bytes("data"));
    expect(await store.has(s, r)).toBe(true);
    await store.delete(s, r);
    expect(await store.has(s, r)).toBe(false);
  });

  it("size() returns byte length", async () => {
    const store = await OpfsBlobStore.create({ rootDir: root });
    const s = scope(ORG_A, WS_1);
    const r = ref("ref-1");
    await store.put(s, r, bytes("12345"));
    expect(await store.size(s, r)).toBe(5);
  });

  it("getUsage aggregates with partial-scope filters", async () => {
    const store = await OpfsBlobStore.create({ rootDir: root });
    await store.put(scope(ORG_A, WS_1), ref("a"), bytes("aaaa")); // 4
    await store.put(scope(ORG_A, WS_2), ref("b"), bytes("bbbbbb")); // 6
    await store.put(scope(ORG_B, WS_1), ref("c"), bytes("cc")); // 2

    expect(await store.getUsage()).toEqual({ bytes: 12, entries: 3 });
    expect(await store.getUsage({ orgId: ORG_A })).toEqual({
      bytes: 10,
      entries: 2,
    });
    expect(
      await store.getUsage({ orgId: ORG_A, workspaceId: WS_1 }),
    ).toEqual({ bytes: 4, entries: 1 });
  });

  it("clear(scope) only removes that scope", async () => {
    const store = await OpfsBlobStore.create({ rootDir: root });
    await store.put(scope(ORG_A, WS_1), ref("a"), bytes("aa"));
    await store.put(scope(ORG_A, WS_2), ref("b"), bytes("bb"));
    await store.clear(scope(ORG_A, WS_1));
    expect(await store.has(scope(ORG_A, WS_1), ref("a"))).toBe(false);
    expect(await store.has(scope(ORG_A, WS_2), ref("b"))).toBe(true);
  });

  it("clearInstance removes all workspaces under an org", async () => {
    const store = await OpfsBlobStore.create({ rootDir: root });
    await store.put(scope(ORG_A, WS_1), ref("a"), bytes("aa"));
    await store.put(scope(ORG_A, WS_2), ref("b"), bytes("bb"));
    await store.put(scope(ORG_B, WS_1), ref("c"), bytes("cc"));
    await store.clearInstance(ORG_A);
    expect(await store.has(scope(ORG_A, WS_1), ref("a"))).toBe(false);
    expect(await store.has(scope(ORG_A, WS_2), ref("b"))).toBe(false);
    expect(await store.has(scope(ORG_B, WS_1), ref("c"))).toBe(true);
  });

  it("evictUntil removes oldest entries first", async () => {
    const store = await OpfsBlobStore.create({ rootDir: root });
    const s = scope(ORG_A, WS_1);
    await store.put(s, ref("oldest"), bytes("xxxx")); // 4
    await new Promise((r) => setTimeout(r, 5));
    await store.put(s, ref("middle"), bytes("yyyy")); // 4
    await new Promise((r) => setTimeout(r, 5));
    await store.put(s, ref("newest"), bytes("zzzz")); // 4

    const freed = await store.evictUntil(5);
    expect(freed).toBe(8);
    expect(await store.has(s, ref("oldest"))).toBe(false);
    expect(await store.has(s, ref("middle"))).toBe(false);
    expect(await store.has(s, ref("newest"))).toBe(true);
  });

  it("index survives a 'restart' (new instance, same root)", async () => {
    const store1 = await OpfsBlobStore.create({ rootDir: root });
    await store1.put(scope(ORG_A, WS_1), ref("r"), bytes("payload"));
    await flush();

    const store2 = await OpfsBlobStore.create({ rootDir: root });
    expect(await store2.has(scope(ORG_A, WS_1), ref("r"))).toBe(true);
    const blob = await store2.openRead(scope(ORG_A, WS_1), ref("r"));
    expect(await blob.text()).toBe("payload");
  });

  it("recovers from a corrupt index.json via index.json.tmp", async () => {
    const store = await OpfsBlobStore.create({ rootDir: root });
    await store.put(scope(ORG_A, WS_1), ref("r"), bytes("data"));
    await flush();

    // Simulate crash: corrupt index.json but leave a valid tmp.
    const evo = (root as unknown as FakeDir).children.get(
      "evo-cache",
    ) as FakeDir;
    const v1 = evo.children.get("v1") as FakeDir;
    const indexFile = v1.children.get("index.json") as FakeFile;
    const tmpFile = new FakeFile("index.json.tmp");
    tmpFile.bytes = indexFile.bytes; // valid backup
    v1.children.set("index.json.tmp", tmpFile);
    indexFile.bytes = new TextEncoder().encode("{not json");

    const store2 = await OpfsBlobStore.create({ rootDir: root });
    expect(await store2.has(scope(ORG_A, WS_1), ref("r"))).toBe(true);
  });

  it("emits 'evicted' event with reason 'manual'", async () => {
    const store = await OpfsBlobStore.create({ rootDir: root });
    const s = scope(ORG_A, WS_1);
    const r = ref("victim");
    await store.put(s, r, bytes("aaaa"));

    const events: { ref: string; reason: string; sizeBytes: number }[] = [];
    store.on("evicted", (e) => {
      events.push({ ref: String(e.ref), reason: e.reason, sizeBytes: e.sizeBytes });
    });
    await store.delete(s, r);
    expect(events).toEqual([{ ref: "victim", reason: "manual", sizeBytes: 4 }]);
  });

  it("openWrite stream commits size on close", async () => {
    const store = await OpfsBlobStore.create({ rootDir: root });
    const s = scope(ORG_A, WS_1);
    const r = ref("streamed");
    const stream = await store.openWrite(s, r, 11);
    await stream.write(new TextEncoder().encode("hello world"));
    await stream.close();
    expect(await store.size(s, r)).toBe(11);
    const blob = await store.openRead(s, r);
    expect(await blob.text()).toBe("hello world");
  });
});
