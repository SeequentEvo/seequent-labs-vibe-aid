import { describe, it, expect, beforeEach, vi } from "vitest";

import { parseOrgId, parseWorkspaceId } from "@/types/ids";
import { InMemoryBlobStore } from "./inMemoryBlobStore";
import { uploadFromStore } from "./upload";
import {
  asBlobRef,
  BlobTransferError,
  type BlobRef,
  type CacheScope,
} from "./types";

const orgA = parseOrgId("11111111-1111-4111-8111-111111111111");
const wsA = parseWorkspaceId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
const scope: CacheScope = {
  orgId: orgA,
  workspaceId: wsA,
  kind: "geoscience-object",
};
const ref: BlobRef = asBlobRef("test-ref");

const SAS_URL =
  "https://acct.blob.core.windows.net/container/blob.dat" +
  "?sv=2024-01-01&sig=abc%2Bdef&se=2025-01-01T00%3A00%3A00Z";

interface BlockRecord {
  readonly blockId: string;
  readonly bytes: Uint8Array;
}

interface CommitRecord {
  readonly ids: string[];
  readonly body: string;
}

interface MockFetchResult {
  mock: typeof fetch;
  readonly blocks: Map<string, BlockRecord>;
  readonly commits: CommitRecord[];
  readonly callLog: { url: string; method: string }[];
  inFlight: number;
  maxInFlight: number;
}

interface MockOptions {
  /** Per-blockid: a queue of statuses to return on each PUT-block call. */
  readonly blockStatuses?: Record<string, number[]>;
  /** Per-call-index queue of statuses for the commit (?comp=blocklist). */
  readonly commitStatuses?: number[];
  /** Per-block delay in ms (used to make concurrency observable). */
  readonly blockDelayMs?: number;
  /** Wait for a signal before resolving each block fetch. */
  readonly waitForRelease?: () => Promise<void>;
}

const setupMockFetch = (opts: MockOptions = {}): MockFetchResult => {
  const blocks = new Map<string, BlockRecord>();
  const commits: CommitRecord[] = [];
  const callLog: { url: string; method: string }[] = [];
  const result: MockFetchResult = {
    mock: undefined as unknown as typeof fetch,
    blocks,
    commits,
    callLog,
    inFlight: 0,
    maxInFlight: 0,
  };

  const blockCallCount = new Map<string, number>();
  let commitCallIndex = 0;

  const mock: typeof fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const urlStr =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = init?.method ?? "GET";
    callLog.push({ url: urlStr, method });

    const signal = init?.signal ?? undefined;
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");

    const u = new URL(urlStr);
    const comp = u.searchParams.get("comp");

    result.inFlight += 1;
    if (result.inFlight > result.maxInFlight) {
      result.maxInFlight = result.inFlight;
    }

    try {
      if (opts.blockDelayMs && comp === "block") {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, opts.blockDelayMs);
          signal?.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new DOMException("aborted", "AbortError"));
          });
        });
      }
      if (opts.waitForRelease && comp === "block") {
        await opts.waitForRelease();
      }

      if (comp === "block") {
        const blockId = u.searchParams.get("blockid") ?? "";
        const calls = blockCallCount.get(blockId) ?? 0;
        blockCallCount.set(blockId, calls + 1);
        const queue = opts.blockStatuses?.[blockId];
        const status = queue && calls < queue.length ? (queue[calls] ?? 200) : 200;
        if (status >= 200 && status < 300) {
          const body = init?.body;
          let bytes: Uint8Array;
          if (body instanceof Blob) {
            bytes = new Uint8Array(await body.arrayBuffer());
          } else if (body instanceof Uint8Array) {
            bytes = body;
          } else if (body instanceof ArrayBuffer) {
            bytes = new Uint8Array(body);
          } else {
            bytes = new Uint8Array(0);
          }
          blocks.set(blockId, { blockId, bytes });
          return new Response(null, { status: 201 });
        }
        return new Response(`status ${String(status)}`, { status });
      }

      if (comp === "blocklist") {
        const status =
          opts.commitStatuses && commitCallIndex < opts.commitStatuses.length
            ? (opts.commitStatuses[commitCallIndex] ?? 200)
            : 200;
        commitCallIndex += 1;
        const body = init?.body;
        const xml = typeof body === "string" ? body : "";
        if (status >= 200 && status < 300) {
          const ids = Array.from(xml.matchAll(/<Latest>([^<]+)<\/Latest>/g))
            .map((m) => m[1])
            .filter((s): s is string => typeof s === "string");
          commits.push({ ids, body: xml });
          return new Response(null, { status: 201 });
        }
        return new Response(`status ${String(status)}`, { status });
      }

      return new Response(null, { status: 200 });
    } finally {
      result.inFlight -= 1;
    }
  };

  result.mock = mock;
  return result;
};

const makeBytes = (size: number, seed = 1): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(size));
  for (let i = 0; i < size; i += 1) out[i] = (i * seed + 7) & 0xff;
  return out;
};

const assemble = (
  fetched: Map<string, BlockRecord>,
  ids: string[],
): Uint8Array => {
  const total = ids.reduce((acc, id) => acc + (fetched.get(id)?.bytes.byteLength ?? 0), 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const id of ids) {
    const rec = fetched.get(id);
    if (!rec) throw new Error(`missing block ${id}`);
    out.set(rec.bytes, cursor);
    cursor += rec.bytes.byteLength;
  }
  return out;
};

const sasParamsOf = (urlStr: string): Record<string, string> => {
  const u = new URL(urlStr);
  return {
    sv: u.searchParams.get("sv") ?? "",
    sig: u.searchParams.get("sig") ?? "",
    se: u.searchParams.get("se") ?? "",
  };
};

describe("uploadFromStore", () => {
  let store: InMemoryBlobStore;

  beforeEach(() => {
    store = new InMemoryBlobStore();
  });

  it("uploads a single-block payload and commits it", async () => {
    const data = makeBytes(1024);
    await store.put(scope, ref, data);
    const fx = setupMockFetch();

    await uploadFromStore({
      store,
      scope,
      ref,
      uploadUrl: SAS_URL,
      chunkSize: 4 * 1024 * 1024,
      fetchImpl: fx.mock,
    });

    expect(fx.blocks.size).toBe(1);
    expect(fx.commits.length).toBe(1);
    const ids = fx.commits[0]?.ids ?? [];
    expect(ids.length).toBe(1);
    expect(assemble(fx.blocks, ids)).toEqual(data);
  });

  it("uploads N blocks in correct order for a multi-chunk payload", async () => {
    const chunkSize = 256;
    const total = chunkSize * 5 + 17; // 6 chunks (last partial)
    const data = makeBytes(total, 3);
    await store.put(scope, ref, data);
    const fx = setupMockFetch();

    await uploadFromStore({
      store,
      scope,
      ref,
      uploadUrl: SAS_URL,
      chunkSize,
      parallelism: 2,
      fetchImpl: fx.mock,
    });

    const ids = fx.commits[0]?.ids ?? [];
    expect(ids.length).toBe(6);
    expect(assemble(fx.blocks, ids)).toEqual(data);

    // SAS query params preserved on every chunk PUT.
    const expectedSas = sasParamsOf(SAS_URL);
    for (const call of fx.callLog) {
      expect(call.method).toBe("PUT");
      expect(sasParamsOf(call.url)).toEqual(expectedSas);
    }
  });

  it("respects parallelism cap (max 4 in-flight)", async () => {
    const chunkSize = 16;
    const data = makeBytes(chunkSize * 12);
    await store.put(scope, ref, data);
    const fx = setupMockFetch({ blockDelayMs: 20 });

    await uploadFromStore({
      store,
      scope,
      ref,
      uploadUrl: SAS_URL,
      chunkSize,
      parallelism: 4,
      fetchImpl: fx.mock,
    });

    expect(fx.maxInFlight).toBeGreaterThan(1);
    expect(fx.maxInFlight).toBeLessThanOrEqual(4);
  });

  it("retries 503 chunks and eventually succeeds", async () => {
    const chunkSize = 32;
    const data = makeBytes(chunkSize * 3);
    await store.put(scope, ref, data);

    const failingId = btoa("000001"); // chunk index 1
    const fx = setupMockFetch({
      blockStatuses: { [failingId]: [503, 503] },
    });

    await uploadFromStore({
      store,
      scope,
      ref,
      uploadUrl: SAS_URL,
      chunkSize,
      parallelism: 2,
      maxRetries: 3,
      retryBaseMs: 1,
      fetchImpl: fx.mock,
    });

    // 3 base chunk calls + 1 commit + 2 retries on failingId = 6
    const blockCalls = fx.callLog.filter((c) =>
      new URL(c.url).searchParams.get("comp") === "block",
    ).length;
    const commitCalls = fx.callLog.filter((c) =>
      new URL(c.url).searchParams.get("comp") === "blocklist",
    ).length;
    expect(blockCalls).toBe(3 + 2);
    expect(commitCalls).toBe(1);
    expect(assemble(fx.blocks, fx.commits[0]?.ids ?? [])).toEqual(data);
  });

  it("throws BlobTransferError with chunkIndex on retry exhaustion (503 forever)", async () => {
    const chunkSize = 32;
    const data = makeBytes(chunkSize * 3);
    await store.put(scope, ref, data);

    const failingIndex = 2;
    const failingId = btoa(String(failingIndex).padStart(6, "0"));
    const fx = setupMockFetch({
      blockStatuses: { [failingId]: Array<number>(99).fill(503) },
    });

    await expect(
      uploadFromStore({
        store,
        scope,
        ref,
        uploadUrl: SAS_URL,
        chunkSize,
        parallelism: 2,
        maxRetries: 2,
        retryBaseMs: 1,
        fetchImpl: fx.mock,
      }),
    ).rejects.toMatchObject({
      name: "BlobTransferError",
      chunkIndex: failingIndex,
      ref,
    });
  });

  it("does not retry on 4xx (403)", async () => {
    const chunkSize = 32;
    const data = makeBytes(chunkSize * 2);
    await store.put(scope, ref, data);

    const failingId = btoa("000000");
    const fx = setupMockFetch({
      blockStatuses: { [failingId]: [403, 403, 403, 403] },
    });

    await expect(
      uploadFromStore({
        store,
        scope,
        ref,
        uploadUrl: SAS_URL,
        chunkSize,
        parallelism: 2,
        maxRetries: 5,
        retryBaseMs: 1,
        fetchImpl: fx.mock,
      }),
    ).rejects.toBeInstanceOf(BlobTransferError);

    // Exactly one attempt for that chunk.
    const failingCalls = fx.callLog.filter((c) => {
      const u = new URL(c.url);
      return (
        u.searchParams.get("comp") === "block" &&
        u.searchParams.get("blockid") === failingId
      );
    });
    expect(failingCalls.length).toBe(1);
  });

  it("throws BlobTransferError(chunkIndex=null) when commit fails forever", async () => {
    const chunkSize = 64;
    const data = makeBytes(chunkSize * 2);
    await store.put(scope, ref, data);

    const fx = setupMockFetch({
      commitStatuses: Array<number>(99).fill(503),
    });

    let caught: unknown;
    try {
      await uploadFromStore({
        store,
        scope,
        ref,
        uploadUrl: SAS_URL,
        chunkSize,
        parallelism: 2,
        maxRetries: 2,
        retryBaseMs: 1,
        fetchImpl: fx.mock,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(BlobTransferError);
    const e = caught as BlobTransferError;
    expect(e.chunkIndex).toBeNull();
    expect(e.ref).toBe(ref);

    // All blocks were uploaded successfully.
    expect(fx.blocks.size).toBe(2);
  });

  it("aborts mid-flight: no further fetches start, source blob preserved", async () => {
    const chunkSize = 64;
    const data = makeBytes(chunkSize * 8);
    await store.put(scope, ref, data);

    const ac = new AbortController();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fx = setupMockFetch({ waitForRelease: () => gate });

    const promise = uploadFromStore({
      store,
      scope,
      ref,
      uploadUrl: SAS_URL,
      chunkSize,
      parallelism: 2,
      maxRetries: 0,
      retryBaseMs: 1,
      fetchImpl: fx.mock,
      signal: ac.signal,
    });

    // Let the worker pool dispatch its initial 2 fetches.
    await new Promise((r) => setTimeout(r, 10));
    const inFlightAtAbort = fx.callLog.length;
    expect(inFlightAtAbort).toBe(2);

    ac.abort();
    release();

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });

    // No new chunk fetches dispatched after abort, and no commit issued.
    const commitCalls = fx.callLog.filter((c) =>
      new URL(c.url).searchParams.get("comp") === "blocklist",
    ).length;
    expect(commitCalls).toBe(0);
    expect(fx.callLog.length).toBe(inFlightAtAbort);

    // Cached source blob still present.
    expect(await store.has(scope, ref)).toBe(true);
    const stillThere = await store.openRead(scope, ref);
    expect(stillThere.size).toBe(data.byteLength);
  });

  it("uses equal-length, base64-decodable block IDs", async () => {
    const chunkSize = 16;
    const data = makeBytes(chunkSize * 7);
    await store.put(scope, ref, data);
    const fx = setupMockFetch();

    await uploadFromStore({
      store,
      scope,
      ref,
      uploadUrl: SAS_URL,
      chunkSize,
      fetchImpl: fx.mock,
    });

    const ids = [...fx.blocks.keys()];
    const lengths = new Set(ids.map((id) => id.length));
    expect(lengths.size).toBe(1);

    for (const id of ids) {
      // Must round-trip through atob without throwing.
      expect(() => atob(id)).not.toThrow();
    }

    // Commit list IDs match — and are in chunk order.
    const firstCommit = fx.commits[0];
    expect(firstCommit).toBeDefined();
    expect(firstCommit?.ids).toEqual(
      Array.from({ length: 7 }, (_, i) => btoa(String(i).padStart(6, "0"))),
    );
  });

  it("fires monotonically-increasing progress, ending at total", async () => {
    const chunkSize = 8;
    const data = makeBytes(chunkSize * 5 + 3);
    await store.put(scope, ref, data);
    const fx = setupMockFetch();
    const events: { transferred: number; total: number }[] = [];

    // Use real timers; force perceptible spacing between progress flushes
    // by introducing a tiny per-block delay > 50 ms throttle interval.
    vi.useRealTimers();

    await uploadFromStore({
      store,
      scope,
      ref,
      uploadUrl: SAS_URL,
      chunkSize,
      parallelism: 1,
      fetchImpl: async (input, init) => {
        await new Promise((r) => setTimeout(r, 60));
        return fx.mock(input, init);
      },
      onProgress: (e) => events.push({ ...e }),
    });

    expect(events.length).toBeGreaterThan(0);
    for (let i = 1; i < events.length; i += 1) {
      const prev = events[i - 1];
      const curr = events[i];
      if (!prev || !curr) continue;
      expect(curr.transferred).toBeGreaterThanOrEqual(prev.transferred);
      expect(curr.total).toBe(data.byteLength);
    }
    const last = events[events.length - 1];
    expect(last?.transferred).toBe(data.byteLength);
  });
});
