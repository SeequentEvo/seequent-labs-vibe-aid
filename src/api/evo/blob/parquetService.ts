/**
 * Cache-first Parquet read/write coordination layer.
 *
 * Combines `parquetCodec` (encode/decode + SHA-256) with a `BlobStore`
 * so callers can:
 *  - read a parquet table from the cache, falling back to a chunked
 *    download via {@link downloadToStore} when the blob is missing;
 *  - encode a parquet table, hash it client-side to derive a `BlobRef`,
 *    and place it in the cache before requesting an upload URL.
 *
 * Heap note: {@link readParquetFromCache} materialises the full blob in
 * heap only for the duration of `decodeParquet` — the cached file stays
 * on disk (or in the in-memory store). This is the only point where heap
 * usage approximates blob size; the chunked download path itself streams
 * straight into the store without buffering the whole blob.
 */

import { downloadToStore } from "./download";
import {
  decodeParquet,
  encodeParquet,
  sha256Hex,
  type Table,
} from "./parquetCodec";
import type { BlobStore } from "./store";
import {
  asBlobRef,
  type BlobRef,
  type CacheScope,
  type ProgressEvent,
} from "./types";

/** Injection point so tests can stub the chunked downloader. */
export type DownloadFn = typeof downloadToStore;

export interface ReadParquetOptions {
  readonly store: BlobStore;
  readonly scope: CacheScope;
  readonly ref: BlobRef;
  /**
   * Resolver invoked when the blob is missing from the cache. Should
   * return the pre-signed download URL and the total byte size. Throw
   * if no URL is available — the error propagates to the caller.
   */
  readonly resolveDownload: () => Promise<{
    url: string;
    totalSize: number;
  }>;
  readonly signal?: AbortSignal;
  readonly onProgress?: (e: ProgressEvent) => void;
  /** Override the chunked downloader (tests). Defaults to `downloadToStore`. */
  readonly download?: DownloadFn;
}

/**
 * Cache-first parquet read.
 *
 * - If the blob is cached: open it, materialise the bytes, decode.
 * - Otherwise: call `resolveDownload`, stream into the store via the
 *   chunked downloader, then decode the freshly-cached blob.
 *
 * Propagates `AbortError`, `BlobStoreQuotaError`, and `BlobTransferError`
 * unchanged so callers can branch on them.
 */
export async function readParquetFromCache(
  opts: ReadParquetOptions,
): Promise<Table> {
  const {
    store,
    scope,
    ref,
    resolveDownload,
    signal,
    onProgress,
    download = downloadToStore,
  } = opts;

  if (await store.has(scope, ref)) {
    const cachedSize = (await store.size(scope, ref)) ?? 0;
    if (cachedSize === 0) {
      // Stale poison entry from a previous failed download. Evict and
      // fall through to a fresh download so we don't surface a cryptic
      // parquet decode error.
      await store.delete(scope, ref);
    } else if (onProgress) {
      // Cache hit: surface a terminal progress event so UI bindings see
      // a final value.
      onProgress({ transferred: cachedSize, total: cachedSize });
    }
  }

  if (!(await store.has(scope, ref))) {
    const { url, totalSize } = await resolveDownload();
    await download({
      store,
      scope,
      ref,
      url,
      totalSize,
      signal,
      onProgress,
    });
  }

  const blob = await store.openRead(scope, ref);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return decodeParquet(bytes);
}

export interface WriteParquetOptions {
  readonly store: BlobStore;
  readonly scope: CacheScope;
  readonly table: Table;
}

export interface WriteParquetResult {
  /** SHA-256 hex digest of the encoded bytes, branded as a `BlobRef`. */
  readonly ref: BlobRef;
  /** Encoded byte length. */
  readonly bytes: number;
}

/**
 * Encode a parquet `Table`, hash it, and place it in the cache.
 *
 * Returns the SHA-256 `BlobRef` so the caller can request a matching
 * upload URL from the relevant Evo API and feed it to the chunked
 * uploader. Propagates `BlobStoreQuotaError` from `store.put` — the
 * caller can decide to upload-without-caching or surface the error.
 */
export async function writeParquetToCache(
  opts: WriteParquetOptions,
): Promise<WriteParquetResult> {
  const { store, scope, table } = opts;
  const encoded = await encodeParquet(table);
  // Re-wrap into an ArrayBuffer-backed view so the value satisfies
  // `BufferSource` under TS's strict ArrayBuffer/SharedArrayBuffer split.
  const bytes = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  bytes.set(encoded);
  const digest = await sha256Hex(bytes);
  const ref = asBlobRef(digest);
  await store.put(scope, ref, bytes);
  return { ref, bytes: bytes.byteLength };
}
