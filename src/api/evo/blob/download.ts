/**
 * Chunked HTTP-Range download into a `BlobStore`.
 *
 * Streams a pre-signed Azure Blob Storage URL into the cache via parallel
 * Range requests, writing each chunk straight to a `FileSystemWritableFileStream`
 * obtained from the store so the whole blob never sits in JS heap.
 *
 * See the `evo-blob-transfers` skill for the underlying Range protocol.
 */

import type { BlobStore } from "./store";
import {
  BlobTransferError,
  type BlobRef,
  type CacheScope,
  type ProgressEvent,
} from "./types";

export interface DownloadOptions {
  readonly store: BlobStore;
  readonly scope: CacheScope;
  readonly ref: BlobRef;
  /** Pre-signed Azure download URL, already resolved by caller. */
  readonly url: string;
  /** Total bytes to fetch (caller knows from object metadata or HEAD). */
  readonly totalSize: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (e: ProgressEvent) => void;
  /** Default 4 MiB. */
  readonly chunkSize?: number;
  /** Default 4 parallel chunks. */
  readonly parallelism?: number;
  /** Per-chunk retry attempts (default 3). */
  readonly maxRetries?: number;
  /** Initial backoff ms (default 250); exponential. */
  readonly retryBaseMs?: number;
  /** `fetch` impl override for tests. */
  readonly fetchImpl?: typeof fetch;
}

const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024;
const DEFAULT_PARALLELISM = 4;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_MS = 250;
const PROGRESS_THROTTLE_MS = 50;

/** Status codes worth retrying (transient server / rate-limit). */
const isRetriableStatus = (status: number): boolean =>
  status >= 500 || status === 408 || status === 429;

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const abortError = (): DOMException =>
  new DOMException("The operation was aborted.", "AbortError");

interface ChunkRange {
  readonly index: number;
  readonly from: number;
  readonly to: number;
}

const planChunks = (totalSize: number, chunkSize: number): ChunkRange[] => {
  if (totalSize === 0) return [];
  const total = Math.ceil(totalSize / chunkSize);
  const chunks: ChunkRange[] = [];
  for (let i = 0; i < total; i += 1) {
    const from = i * chunkSize;
    const to = Math.min(from + chunkSize - 1, totalSize - 1);
    chunks.push({ index: i, from, to });
  }
  return chunks;
};

/**
 * Fetch a single chunk with retry/backoff. Throws `BlobTransferError` after
 * `maxRetries` failed attempts. Honours `signal` between attempts.
 */
async function fetchChunk(
  chunk: ChunkRange,
  opts: {
    url: string;
    ref: BlobRef;
    signal?: AbortSignal;
    maxRetries: number;
    retryBaseMs: number;
    fetchImpl: typeof fetch;
  },
): Promise<ArrayBuffer> {
  let attempt = 0;
  let lastError: unknown;
  // Total tries = maxRetries + 1 (initial attempt + retries).
  while (attempt <= opts.maxRetries) {
    if (opts.signal?.aborted) throw abortError();
    try {
      const res = await opts.fetchImpl(opts.url, {
        headers: { Range: `bytes=${String(chunk.from)}-${String(chunk.to)}` },
        signal: opts.signal,
      });
      // Azure returns 206 for Range; 200 acceptable when the range covers
      // the whole blob. Anything else is an error.
      if (res.status === 206 || res.status === 200) {
        return await res.arrayBuffer();
      }
      // Non-retriable 4xx: fail fast (likely permission/URL-expired).
      if (!isRetriableStatus(res.status)) {
        throw new BlobTransferError({
          ref: opts.ref,
          chunkIndex: chunk.index,
          message: `Chunk ${String(chunk.index)} failed with HTTP ${String(res.status)}`,
        });
      }
      lastError = new Error(`HTTP ${String(res.status)}`);
    } catch (err) {
      if (err instanceof BlobTransferError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      lastError = err;
    }

    if (attempt === opts.maxRetries) break;
    const backoff = opts.retryBaseMs * 2 ** attempt;
    const jitter = backoff * (Math.random() * 0.5 - 0.25);
    await sleep(Math.max(0, backoff + jitter), opts.signal);
    attempt += 1;
  }

  throw new BlobTransferError({
    ref: opts.ref,
    chunkIndex: chunk.index,
    message: `Chunk ${String(chunk.index)} exhausted ${String(opts.maxRetries)} retries`,
    cause: lastError,
  });
}

export async function downloadToStore(opts: DownloadOptions): Promise<void> {
  const {
    store,
    scope,
    ref,
    url,
    totalSize,
    signal,
    onProgress,
    chunkSize = DEFAULT_CHUNK_SIZE,
    parallelism = DEFAULT_PARALLELISM,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryBaseMs = DEFAULT_RETRY_BASE_MS,
    // Firefox throws "fetch called on an object that does not implement
    // interface Window" when the global `fetch` is invoked with anything
    // other than `globalThis` as the receiver — which happens here because
    // we call it through `opts.fetchImpl(...)`. Binding restores the
    // expected receiver.
    fetchImpl = fetch.bind(globalThis),
  } = opts;

  if (totalSize < 0) throw new Error("totalSize must be >= 0");
  if (chunkSize <= 0) throw new Error("chunkSize must be > 0");
  if (parallelism <= 0) throw new Error("parallelism must be > 0");

  if (signal?.aborted) throw abortError();

  // Cache-first short-circuit. Still surface a final progress event so
  // callers binding UI state see a terminal value.
  if (await store.has(scope, ref)) {
    onProgress?.({ transferred: totalSize, total: totalSize });
    return;
  }

  // openWrite may throw BlobStoreQuotaError — propagate.
  const stream = await store.openWrite(scope, ref, totalSize);

  const chunks = planChunks(totalSize, chunkSize);

  let bytesTransferred = 0;
  let lastProgressMs = 0;
  const fireProgress = (force = false): void => {
    if (!onProgress) return;
    const now = Date.now();
    if (!force && now - lastProgressMs < PROGRESS_THROTTLE_MS) return;
    lastProgressMs = now;
    onProgress({ transferred: bytesTransferred, total: totalSize });
  };

  const cleanup = async (): Promise<void> => {
    try {
      const abortable = stream as { abort?: () => Promise<void> };
      if (typeof abortable.abort === "function") {
        await abortable.abort();
      } else {
        try {
          await stream.truncate(0);
        } catch {
          /* ignore */
        }
        await stream.close();
      }
    } catch {
      /* ignore */
    }
    try {
      await store.delete(scope, ref);
    } catch {
      /* ignore */
    }
  };

  // Worker pool: shared queue + N workers.
  let nextIndex = 0;
  const take = (): ChunkRange | undefined => {
    if (nextIndex >= chunks.length) return undefined;
    const c = chunks[nextIndex];
    nextIndex += 1;
    return c;
  };

  const worker = async (): Promise<void> => {
    for (;;) {
      if (signal?.aborted) throw abortError();
      const chunk = take();
      if (!chunk) return;
      const buf = await fetchChunk(chunk, {
        url,
        ref,
        signal,
        maxRetries,
        retryBaseMs,
        fetchImpl,
      });
      // Defensive: server might over-deliver; trim to declared chunk length.
      const expected = chunk.to - chunk.from + 1;
      const data =
        buf.byteLength === expected ? buf : buf.slice(0, expected);
      await stream.write({
        type: "write",
        position: chunk.from,
        data,
      });
      bytesTransferred += data.byteLength;
      fireProgress();
    }
  };

  try {
    const workerCount = Math.min(parallelism, Math.max(1, chunks.length));
    const workers: Promise<void>[] = [];
    for (let i = 0; i < workerCount; i += 1) workers.push(worker());
    await Promise.all(workers);
    await stream.close();
    fireProgress(true);
  } catch (err) {
    await cleanup();
    throw err;
  }
}
