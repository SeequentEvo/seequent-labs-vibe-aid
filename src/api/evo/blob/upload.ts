/**
 * Chunked upload from a `BlobStore` to a pre-signed Azure Block Blob URL.
 *
 * Implements the two-phase Put Block / Put Block List protocol described in
 * `evo-blob-transfers/SKILL.md`:
 *   1. Slice the source blob into equal-sized chunks (last one may be smaller).
 *   2. Upload each chunk as a named block via PUT `?comp=block&blockid=...`.
 *   3. Commit the blob via PUT `?comp=blocklist` with an XML block list.
 *
 * Chunks are sliced lazily from the cached `Blob` (zero-copy in the browser),
 * so peak heap is roughly `chunkSize * parallelism` rather than the full
 * blob size. Per-chunk retries with exponential backoff handle transient
 * 5xx / 408 / 429 / network failures; non-retryable 4xx fail fast.
 */

import type { BlobStore } from "./store";
import {
  BlobTransferError,
  type BlobRef,
  type CacheScope,
  type ProgressEvent,
} from "./types";
import {
  HttpError,
  RetryableHttpError,
  createProgressEmitter,
  isAbortError,
  isRetryableStatus,
  toAbortError,
  withRetry,
} from "./transferHelpers";

const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024;
const DEFAULT_PARALLELISM = 4;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_MS = 250;

/** Equal-length base64 block IDs (8 chars), max 999 999 chunks ≈ 4 TiB at 4 MiB. */
const blockIdFor = (index: number): string =>
  btoa(String(index).padStart(6, "0"));

const buildBlockUrl = (uploadUrl: string, blockId: string): string => {
  const url = new URL(uploadUrl);
  url.searchParams.set("comp", "block");
  url.searchParams.set("blockid", blockId);
  return url.toString();
};

const buildCommitUrl = (uploadUrl: string): string => {
  const url = new URL(uploadUrl);
  url.searchParams.set("comp", "blocklist");
  return url.toString();
};

const buildBlockListXml = (blockIds: readonly string[]): string => {
  const items = blockIds.map((id) => `<Latest>${id}</Latest>`).join("");
  return `<?xml version="1.0" encoding="utf-8"?><BlockList>${items}</BlockList>`;
};

export interface UploadOptions {
  readonly store: BlobStore;
  readonly scope: CacheScope;
  readonly ref: BlobRef;
  /** Pre-signed Azure Put Block URL (SAS query params preserved). */
  readonly uploadUrl: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (e: ProgressEvent) => void;
  /** Defaults to 4 MiB. */
  readonly chunkSize?: number;
  /** Defaults to 4. */
  readonly parallelism?: number;
  /** Defaults to 3. */
  readonly maxRetries?: number;
  /** Defaults to 250 ms. */
  readonly retryBaseMs?: number;
  /** Inject a custom `fetch` (tests, polyfills). */
  readonly fetchImpl?: typeof fetch;
}

export const uploadFromStore = async (opts: UploadOptions): Promise<void> => {
  const {
    store,
    scope,
    ref,
    uploadUrl,
    signal,
    onProgress,
    chunkSize = DEFAULT_CHUNK_SIZE,
    parallelism = DEFAULT_PARALLELISM,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryBaseMs = DEFAULT_RETRY_BASE_MS,
    // See download.ts for why `fetch.bind(globalThis)` is required: Firefox
    // rejects bare-receiver invocations of the global `fetch`.
    fetchImpl = fetch.bind(globalThis),
  } = opts;

  if (chunkSize <= 0) throw new Error("chunkSize must be > 0");
  if (parallelism <= 0) throw new Error("parallelism must be > 0");

  if (signal?.aborted) throw toAbortError();

  const blob = await store.openRead(scope, ref);
  const totalBytes = blob.size;
  const totalChunks = totalBytes === 0 ? 0 : Math.ceil(totalBytes / chunkSize);

  const blockIds: string[] = new Array<string>(totalChunks);
  for (let i = 0; i < totalChunks; i += 1) blockIds[i] = blockIdFor(i);

  const progress = createProgressEmitter(totalBytes, onProgress);

  const uploadOneChunk = async (index: number): Promise<void> => {
    const from = index * chunkSize;
    const to = Math.min(from + chunkSize, totalBytes);
    const chunk = blob.slice(from, to);
    const blockId = blockIds[index] ?? blockIdFor(index);
    const url = buildBlockUrl(uploadUrl, blockId);

    try {
      await withRetry(
        async () => {
          if (signal?.aborted) throw toAbortError();
          const res = await fetchImpl(url, {
            method: "PUT",
            body: chunk,
            signal,
          });
          if (!res.ok) {
            if (isRetryableStatus(res.status)) {
              throw new RetryableHttpError(res.status);
            }
            throw new HttpError(res.status);
          }
        },
        { maxRetries, baseMs: retryBaseMs, signal },
      );
    } catch (err) {
      if (isAbortError(err)) throw err;
      throw new BlobTransferError({
        ref,
        chunkIndex: index,
        message: `Failed to upload chunk ${String(index)} after retries`,
        cause: err,
      });
    }

    progress.add(to - from);
  };

  // Worker pool: `parallelism` workers pull the next chunk index off a
  // shared cursor. Naturally bounds in-flight fetches to `parallelism`.
  let cursor = 0;
  const workers: Promise<void>[] = [];
  const workerCount = Math.min(parallelism, Math.max(totalChunks, 1));

  const worker = async (): Promise<void> => {
    while (true) {
      if (signal?.aborted) throw toAbortError();
      const index = cursor;
      cursor += 1;
      if (index >= totalChunks) return;
      await uploadOneChunk(index);
    }
  };

  if (totalChunks > 0) {
    for (let w = 0; w < workerCount; w += 1) workers.push(worker());
    await Promise.all(workers);
  }

  if (signal?.aborted) throw toAbortError();

  const commitUrl = buildCommitUrl(uploadUrl);
  const body = buildBlockListXml(blockIds);

  try {
    await withRetry(
      async () => {
        if (signal?.aborted) throw toAbortError();
        const res = await fetchImpl(commitUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/xml" },
          body,
          signal,
        });
        if (!res.ok) {
          if (isRetryableStatus(res.status)) {
            throw new RetryableHttpError(res.status);
          }
          throw new HttpError(res.status);
        }
      },
      { maxRetries, baseMs: retryBaseMs, signal },
    );
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new BlobTransferError({
      ref,
      chunkIndex: null,
      message: "Failed to commit block list after retries",
      cause: err,
    });
  }

  progress.flush();
};
