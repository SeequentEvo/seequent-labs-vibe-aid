/**
 * `BlobStore` — abstract cache interface for opaque binary blobs.
 *
 * Two implementations:
 * - `OpfsBlobStore` (production) — persistent, OPFS-backed, automatic LRU.
 * - `InMemoryBlobStore` (tests + non-OPFS environments) — same interface,
 *   in-process `Map`.
 *
 * Domain code never imports either implementation directly — it depends on
 * this interface so the backend can be swapped (e.g. for tests).
 */

import type { OrgId } from "@/types/ids";
import type {
  BlobKind,
  BlobRef,
  BlobStoreEvents,
  CacheScope,
  Unsubscribe,
} from "./types";

export interface UsageReport {
  readonly bytes: number;
  readonly entries: number;
}

export interface BlobStore {
  /** Whether the cache currently holds a blob for this scope+ref. */
  has(scope: CacheScope, ref: BlobRef): Promise<boolean>;

  /** Size in bytes, or `undefined` when absent. */
  size(scope: CacheScope, ref: BlobRef): Promise<number | undefined>;

  /**
   * Read the cached bytes as a `Blob`. Throws if absent — callers should
   * `has()`-check first or run a download to populate.
   *
   * Touches `lastAccessMs` for LRU.
   */
  openRead(scope: CacheScope, ref: BlobRef): Promise<Blob>;

  /**
   * Open a writable stream into a fresh cache entry of the declared total
   * size. Used by chunked downloaders to write Range chunks at known
   * positions without holding the whole blob in heap.
   *
   * The store reserves `totalBytes` against the budget and may evict
   * other entries before returning. If the entry cannot fit (even after
   * eviction), throws `BlobStoreQuotaError`.
   *
   * The caller MUST `close()` the stream to commit; closing without
   * writing `totalBytes` of data leaves a short entry in the cache —
   * the caller is responsible for `delete`ing on failure.
   */
  openWrite(
    scope: CacheScope,
    ref: BlobRef,
    totalBytes: number,
  ): Promise<FileSystemWritableFileStream>;

  /**
   * Write a complete in-memory buffer in one shot. Convenience for
   * `parquet-wasm` writes (which produce the whole buffer at once).
   * Performs eviction first and throws `BlobStoreQuotaError` if no room.
   */
  put(scope: CacheScope, ref: BlobRef, bytes: BufferSource): Promise<void>;

  /** Remove a single entry. No-op if absent. */
  delete(scope: CacheScope, ref: BlobRef): Promise<void>;

  /** Remove every entry in a scope. */
  clear(scope: CacheScope): Promise<void>;

  /** Remove every entry under an org/instance (across all workspaces+kinds). */
  clearInstance(orgId: OrgId): Promise<void>;

  /** Remove every entry. */
  clearAll(): Promise<void>;

  /**
   * Aggregate cached bytes + entry count, optionally filtered by partial
   * scope (e.g. `{orgId}` or `{orgId, workspaceId, kind}`).
   */
  getUsage(scope?: Partial<CacheScope>): Promise<UsageReport>;

  /**
   * Force eviction of the oldest entries until total cache size is at
   * most `targetBytes`. Returns bytes freed. Manual operations also fire
   * `evicted` events with `reason: 'manual'`.
   */
  evictUntil(targetBytes: number): Promise<number>;

  /** Subscribe to a typed event. Returns an unsubscribe function. */
  on<E extends keyof BlobStoreEvents>(
    event: E,
    listener: (data: BlobStoreEvents[E]) => void,
  ): Unsubscribe;
}

/** Compose an OPFS-style relative path for a scope+ref. */
export const cacheKeyPath = (scope: CacheScope, ref: BlobRef): string =>
  `${scope.orgId}/${scope.workspaceId}/${scope.kind satisfies BlobKind}/${ref}`;
