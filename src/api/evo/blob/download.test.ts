import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { parseOrgId, parseWorkspaceId } from "@/types/ids";
import { downloadToStore } from "./download";
import { InMemoryBlobStore } from "./inMemoryBlobStore";
import {
  asBlobRef,
  BlobTransferError,
  type BlobRef,
  type CacheScope,
} from "./types";

const orgId = parseOrgId("11111111-1111-4111-8111-111111111111");
const workspaceId = parseWorkspaceId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
const scope: CacheScope = { orgId, workspaceId, kind: "geoscience-object" };
const ref = (id: string): BlobRef => asBlobRef(id);

const URL_OK = "https://example.test/blob?sig=abc";

const makeBytes = (n: number): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(n));
  for (let i = 0; i < n; i += 1) out[i] = i & 0xff;
  return out;
};

const readCachedBytes = async (
  store: InMemoryBlobStore,
  s: CacheScope,
  r: BlobRef,
): Promise<Uint8Array> => {
  const blob = await store.openRead(s, r);
  return new Uint8Array(await blob.arrayBuffer());
};

interface RangeFetch {
  fetch: typeof fetch;
  /** Per-call recorded ranges (in order). */
  calls: { from: number; to: number }[];
  /** How many fetches are currently in-flight. */
  inFlightPeak: () => number;
}

interface RangeFetchOptions {
  failures?: Map<number, number>;
  failStatus?: number;
  alwaysFailRanges?: Set<number>;
  alwaysFailStatus?: number;
  delayMs?: number;
}

const parseRange = (header: string | null): { from: number; to: number } => {
  if (!header) throw new Error("missing Range header");
  const m = /^bytes=(\d+)-(\d+)$/.exec(header);
  if (!m) throw new Error(`bad Range: ${header}`);
  return { from: Number(m[1]), to: Number(m[2]) };
};

const buildRangeFetch = (
  body: Uint8Array,
  opts: RangeFetchOptions = {},
): RangeFetch => {
  const calls: { from: number; to: number }[] = [];
  let inFlight = 0;
  let peak = 0;
  const failuresLeft = new Map(opts.failures ?? []);

  const impl: typeof fetch = async (_input, init) => {
    const headers = new Headers(init?.headers);
    const range = parseRange(headers.get("Range"));
    calls.push(range);
    inFlight += 1;
    if (inFlight > peak) peak = inFlight;
    try {
      // Honour aborts even before any artificial delay.
      if (init?.signal?.aborted) {
        throw new DOMException("aborted", "AbortError");
      }
      if (opts.delayMs && opts.delayMs > 0) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, opts.delayMs);
          init?.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(t);
              reject(new DOMException("aborted", "AbortError"));
            },
            { once: true },
          );
        });
      }

      if (opts.alwaysFailRanges?.has(range.from)) {
        return new Response("err", {
          status: opts.alwaysFailStatus ?? 503,
        });
      }
      const left = failuresLeft.get(range.from) ?? 0;
      if (left > 0) {
        failuresLeft.set(range.from, left - 1);
        return new Response("err", { status: opts.failStatus ?? 503 });
      }
      const slice = body.slice(range.from, range.to + 1);
      return new Response(slice, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${String(range.from)}-${String(range.to)}/${String(body.byteLength)}`,
        },
      });
    } finally {
      inFlight -= 1;
    }
  };

  return { fetch: impl, calls, inFlightPeak: () => peak };
};

describe("downloadToStore", () => {
  let store: InMemoryBlobStore;

  beforeEach(() => {
    store = new InMemoryBlobStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("downloads a small single-chunk file and caches it", async () => {
    const body = makeBytes(123);
    const r = ref("small");
    const fx = buildRangeFetch(body);

    await downloadToStore({
      store,
      scope,
      ref: r,
      url: URL_OK,
      totalSize: body.byteLength,
      chunkSize: 4 * 1024 * 1024,
      fetchImpl: fx.fetch,
    });

    expect(await store.has(scope, r)).toBe(true);
    const cached = await readCachedBytes(store, scope, r);
    expect(cached).toEqual(body);
    expect(fx.calls).toHaveLength(1);
    expect(fx.calls[0]).toEqual({ from: 0, to: 122 });
  });

  it("downloads a multi-chunk file and reassembles bytes correctly", async () => {
    const body = makeBytes(10_000);
    const r = ref("multi");
    const fx = buildRangeFetch(body);

    await downloadToStore({
      store,
      scope,
      ref: r,
      url: URL_OK,
      totalSize: body.byteLength,
      chunkSize: 1024,
      parallelism: 4,
      fetchImpl: fx.fetch,
    });

    const cached = await readCachedBytes(store, scope, r);
    expect(cached).toEqual(body);
    expect(fx.calls).toHaveLength(Math.ceil(10_000 / 1024));
    // First chunk starts at 0, last chunk ends at totalSize-1.
    expect(fx.calls[0]?.from).toBe(0);
    const last = fx.calls.find((c) => c.to === 9_999);
    expect(last).toBeDefined();
  });

  it("fires up to `parallelism` concurrent fetches", async () => {
    const body = makeBytes(8 * 1024);
    const fx = buildRangeFetch(body, { delayMs: 25 });

    await downloadToStore({
      store,
      scope,
      ref: ref("par"),
      url: URL_OK,
      totalSize: body.byteLength,
      chunkSize: 1024,
      parallelism: 4,
      fetchImpl: fx.fetch,
    });

    expect(fx.inFlightPeak()).toBeGreaterThan(1);
    expect(fx.inFlightPeak()).toBeLessThanOrEqual(4);
  });

  it("short-circuits when the blob is already cached", async () => {
    const r = ref("cached");
    const body = makeBytes(64);
    await store.put(scope, r, body);

    const fx = buildRangeFetch(body);
    const progress: number[] = [];
    await downloadToStore({
      store,
      scope,
      ref: r,
      url: URL_OK,
      totalSize: body.byteLength,
      fetchImpl: fx.fetch,
      onProgress: (e) => progress.push(e.transferred),
    });

    expect(fx.calls).toHaveLength(0);
    expect(progress.at(-1)).toBe(body.byteLength);
  });

  it("retries transient 503s and ultimately succeeds", async () => {
    const body = makeBytes(2_000);
    const fx = buildRangeFetch(body, {
      // The chunk starting at offset 0 fails twice then succeeds.
      failures: new Map([[0, 2]]),
    });

    await downloadToStore({
      store,
      scope,
      ref: ref("retry"),
      url: URL_OK,
      totalSize: body.byteLength,
      chunkSize: 1024,
      parallelism: 1,
      retryBaseMs: 1,
      fetchImpl: fx.fetch,
    });

    // 2 chunks total, chunk 0 took 3 attempts, chunk 1 took 1 = 4 calls.
    expect(fx.calls.length).toBe(4);
    const chunk0Calls = fx.calls.filter((c) => c.from === 0).length;
    expect(chunk0Calls).toBe(3);
  });

  it("throws BlobTransferError when retries are exhausted", async () => {
    const body = makeBytes(2_000);
    const fx = buildRangeFetch(body, {
      alwaysFailRanges: new Set([1024]),
      alwaysFailStatus: 503,
    });

    await expect(
      downloadToStore({
        store,
        scope,
        ref: ref("exhaust"),
        url: URL_OK,
        totalSize: body.byteLength,
        chunkSize: 1024,
        parallelism: 1,
        maxRetries: 2,
        retryBaseMs: 1,
        fetchImpl: fx.fetch,
      }),
    ).rejects.toMatchObject({
      name: "BlobTransferError",
      chunkIndex: 1,
    });

    expect(await store.has(scope, ref("exhaust"))).toBe(false);
  });

  it("does not retry on 4xx errors (e.g. 403)", async () => {
    const body = makeBytes(2_000);
    const fx = buildRangeFetch(body, {
      alwaysFailRanges: new Set([0]),
      alwaysFailStatus: 403,
    });

    await expect(
      downloadToStore({
        store,
        scope,
        ref: ref("forbidden"),
        url: URL_OK,
        totalSize: body.byteLength,
        chunkSize: 1024,
        parallelism: 1,
        maxRetries: 5,
        retryBaseMs: 1,
        fetchImpl: fx.fetch,
      }),
    ).rejects.toBeInstanceOf(BlobTransferError);

    // Exactly one attempt — no retries on 403.
    const chunk0Calls = fx.calls.filter((c) => c.from === 0).length;
    expect(chunk0Calls).toBe(1);
  });

  it("aborts mid-flight, cleans up the cache entry, and stops fetching", async () => {
    const body = makeBytes(16 * 1024);
    const fx = buildRangeFetch(body, { delayMs: 50 });
    const controller = new AbortController();

    const promise = downloadToStore({
      store,
      scope,
      ref: ref("abort"),
      url: URL_OK,
      totalSize: body.byteLength,
      chunkSize: 1024,
      parallelism: 2,
      fetchImpl: fx.fetch,
      signal: controller.signal,
    });

    setTimeout(() => {
      controller.abort();
    }, 10);

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });

    expect(await store.has(scope, ref("abort"))).toBe(false);
    const callsAtAbort = fx.calls.length;
    // Allow microtasks to settle, then ensure no further fetches occurred.
    await new Promise((r) => setTimeout(r, 100));
    expect(fx.calls.length).toBe(callsAtAbort);
  });

  it("reports progress monotonically, ending at totalSize", async () => {
    const body = makeBytes(8 * 1024);
    const fx = buildRangeFetch(body);
    const seen: number[] = [];

    await downloadToStore({
      store,
      scope,
      ref: ref("progress"),
      url: URL_OK,
      totalSize: body.byteLength,
      chunkSize: 1024,
      parallelism: 2,
      fetchImpl: fx.fetch,
      onProgress: (e) => seen.push(e.transferred),
    });

    expect(seen.length).toBeGreaterThan(0);
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i] ?? 0).toBeGreaterThanOrEqual(seen[i - 1] ?? 0);
    }
    expect(seen.at(-1)).toBe(body.byteLength);
  });
});
