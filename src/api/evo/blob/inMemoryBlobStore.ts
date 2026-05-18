/**
 * `InMemoryBlobStore` — `BlobStore` implementation backed entirely by a
 * `Map`. Used by unit tests and as a fallback in environments without OPFS
 * (e.g. SSR, jsdom). LRU and budget semantics mirror `OpfsBlobStore` so
 * callers can swap them without behavioural surprises.
 */

import type { OrgId } from "@/types/ids";
import { cacheKeyPath, type BlobStore, type UsageReport } from "./store";
import {
  BlobStoreQuotaError,
  type BlobRef,
  type BlobStoreEvents,
  type CacheScope,
  type EvictionReason,
  type Unsubscribe,
} from "./types";

interface Entry {
  bytes: Uint8Array;
  meta: {
    scope: CacheScope;
    ref: BlobRef;
    sizeBytes: number;
    lastAccessMs: number;
  };
}

type Listener<E extends keyof BlobStoreEvents> = (
  data: BlobStoreEvents[E],
) => void;

const PRESSURE_THROTTLE_MS = 1000;

const toUint8Array = (src: BufferSource): Uint8Array => {
  if (src instanceof Uint8Array) return new Uint8Array(src);
  if (src instanceof ArrayBuffer) return new Uint8Array(src.slice(0));
  const view = src;
  return new Uint8Array(
    view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
  );
};

export interface InMemoryBlobStoreOptions {
  /** Hard byte budget. Defaults to no budget (no eviction). */
  readonly budgetBytes?: number;
}

export class InMemoryBlobStore implements BlobStore {
  readonly #entries = new Map<string, Entry>();
  readonly #budgetBytes: number;
  readonly #listeners: {
    [E in keyof BlobStoreEvents]: Set<Listener<E>>;
  } = {
    "budget-pressure": new Set(),
    evicted: new Set(),
    "quota-error": new Set(),
  };
  #lastPressureMs = 0;
  #bytesUsed = 0;

  constructor(options: InMemoryBlobStoreOptions = {}) {
    this.#budgetBytes = options.budgetBytes ?? Number.POSITIVE_INFINITY;
  }

  has(scope: CacheScope, ref: BlobRef): Promise<boolean> {
    const key = cacheKeyPath(scope, ref);
    const entry = this.#entries.get(key);
    if (entry) entry.meta.lastAccessMs = Date.now();
    return Promise.resolve(entry !== undefined);
  }

  size(scope: CacheScope, ref: BlobRef): Promise<number | undefined> {
    const entry = this.#entries.get(cacheKeyPath(scope, ref));
    if (!entry) return Promise.resolve(undefined);
    entry.meta.lastAccessMs = Date.now();
    return Promise.resolve(entry.meta.sizeBytes);
  }

  openRead(scope: CacheScope, ref: BlobRef): Promise<Blob> {
    const entry = this.#entries.get(cacheKeyPath(scope, ref));
    if (!entry) {
      return Promise.reject(
        new Error(`No cached blob for ${cacheKeyPath(scope, ref)}`),
      );
    }
    entry.meta.lastAccessMs = Date.now();
    // Copy so callers cannot mutate the cached buffer through the Blob.
    return Promise.resolve(new Blob([new Uint8Array(entry.bytes)]));
  }

  put(scope: CacheScope, ref: BlobRef, bytes: BufferSource): Promise<void> {
    try {
      const buf = toUint8Array(bytes);
      this.#commit(scope, ref, buf);
    } catch (err) {
      return Promise.reject(err as Error);
    }
    return Promise.resolve();
  }

  openWrite(
    scope: CacheScope,
    ref: BlobRef,
    totalBytes: number,
  ): Promise<FileSystemWritableFileStream> {
    if (totalBytes < 0) {
      return Promise.reject(new Error("totalBytes must be >= 0"));
    }
    // Pre-flight quota check matching OPFS semantics: if the declared blob
    // alone exceeds the budget there's no point streaming chunks.
    if (totalBytes > this.#budgetBytes) {
      const err = new BlobStoreQuotaError({
        ref,
        sizeBytes: totalBytes,
        bytesUsed: this.#bytesUsed,
        bytesBudget: this.#budgetBytes,
      });
      this.#emit("quota-error", { ref, sizeBytes: totalBytes });
      return Promise.reject(err);
    }

    const buffer = { value: new Uint8Array(totalBytes) };
    let cursor = 0;
    let aborted = false;
    let closed = false;
    const ensureCapacity = (needed: number): void => {
      if (needed <= buffer.value.byteLength) return;
      const next = new Uint8Array(needed);
      next.set(buffer.value);
      buffer.value = next;
    };
    const writeAt = (position: number, data: Uint8Array): void => {
      const end = position + data.byteLength;
      ensureCapacity(end);
      buffer.value.set(data, position);
      cursor = end;
    };

    const stream = {
      write: (
        chunk:
          | BufferSource
          | { type: "write"; position?: number; data: BufferSource }
          | { type: "seek"; position: number }
          | { type: "truncate"; size: number },
      ): Promise<void> => {
        if (aborted || closed) {
          return Promise.reject(new Error("Stream is no longer writable"));
        }
        if (
          chunk &&
          typeof chunk === "object" &&
          "type" in chunk &&
          typeof chunk.type === "string"
        ) {
          if (chunk.type === "write") {
            const data = toUint8Array(chunk.data);
            const position = chunk.position ?? cursor;
            writeAt(position, data);
            return Promise.resolve();
          }
          if (chunk.type === "seek") {
            cursor = chunk.position;
            return Promise.resolve();
          }
          if (chunk.type === "truncate") {
            const next = new Uint8Array(chunk.size);
            next.set(buffer.value.subarray(0, Math.min(chunk.size, buffer.value.byteLength)));
            buffer.value = next;
            if (cursor > chunk.size) cursor = chunk.size;
            return Promise.resolve();
          }
        }
        const data = toUint8Array(chunk as BufferSource);
        writeAt(cursor, data);
        return Promise.resolve();
      },
      seek: (position: number): Promise<void> => {
        cursor = position;
        return Promise.resolve();
      },
      truncate: (size: number): Promise<void> => {
        const next = new Uint8Array(size);
        next.set(buffer.value.subarray(0, Math.min(size, buffer.value.byteLength)));
        buffer.value = next;
        if (cursor > size) cursor = size;
        return Promise.resolve();
      },
      close: (): Promise<void> => {
        if (aborted) return Promise.resolve();
        if (closed) return Promise.resolve();
        closed = true;
        try {
          this.#commit(scope, ref, buffer.value);
        } catch (err) {
          return Promise.reject(err as Error);
        }
        return Promise.resolve();
      },
      abort: (): Promise<void> => {
        aborted = true;
        return Promise.resolve();
      },
    };

    // safe cast: structural subset; full FS API not required for in-memory use
    return Promise.resolve(stream as unknown as FileSystemWritableFileStream);
  }

  delete(scope: CacheScope, ref: BlobRef): Promise<void> {
    this.#removeKey(cacheKeyPath(scope, ref), "manual");
    return Promise.resolve();
  }

  clear(scope: CacheScope): Promise<void> {
    for (const [key, entry] of [...this.#entries]) {
      const m = entry.meta.scope;
      if (
        m.orgId === scope.orgId &&
        m.workspaceId === scope.workspaceId &&
        m.kind === scope.kind
      ) {
        this.#removeKey(key, "manual");
      }
    }
    return Promise.resolve();
  }

  clearInstance(orgId: OrgId): Promise<void> {
    for (const [key, entry] of [...this.#entries]) {
      if (entry.meta.scope.orgId === orgId) this.#removeKey(key, "manual");
    }
    return Promise.resolve();
  }

  clearAll(): Promise<void> {
    for (const key of [...this.#entries.keys()]) this.#removeKey(key, "manual");
    return Promise.resolve();
  }

  getUsage(scope?: Partial<CacheScope>): Promise<UsageReport> {
    let bytes = 0;
    let entries = 0;
    for (const entry of this.#entries.values()) {
      const m = entry.meta.scope;
      if (scope?.orgId !== undefined && m.orgId !== scope.orgId) continue;
      if (
        scope?.workspaceId !== undefined &&
        m.workspaceId !== scope.workspaceId
      )
        continue;
      if (scope?.kind !== undefined && m.kind !== scope.kind) continue;
      bytes += entry.meta.sizeBytes;
      entries += 1;
    }
    return Promise.resolve({ bytes, entries });
  }

  evictUntil(targetBytes: number): Promise<number> {
    const freed = this.#evictTo(targetBytes, "manual");
    return Promise.resolve(freed);
  }

  on<E extends keyof BlobStoreEvents>(
    event: E,
    listener: (data: BlobStoreEvents[E]) => void,
  ): Unsubscribe {
    const set = this.#listeners[event];
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  /* ---- internals ---- */

  #commit(scope: CacheScope, ref: BlobRef, bytes: Uint8Array): void {
    const sizeBytes = bytes.byteLength;
    const key = cacheKeyPath(scope, ref);
    const existing = this.#entries.get(key);
    const projected =
      this.#bytesUsed - (existing?.meta.sizeBytes ?? 0) + sizeBytes;

    if (projected > this.#budgetBytes) {
      const target = Math.max(0, this.#budgetBytes - sizeBytes);
      // Remove the existing entry so it can be replaced cleanly and is not
      // a candidate for self-eviction.
      if (existing) this.#removeKey(key, "lru-budget");
      this.#evictTo(target, "lru-budget");
      this.#emitPressure();
      if (this.#bytesUsed + sizeBytes > this.#budgetBytes) {
        const err = new BlobStoreQuotaError({
          ref,
          sizeBytes,
          bytesUsed: this.#bytesUsed,
          bytesBudget: this.#budgetBytes,
        });
        this.#emit("quota-error", { ref, sizeBytes });
        throw err;
      }
    } else if (existing) {
      this.#bytesUsed -= existing.meta.sizeBytes;
    }

    this.#entries.set(key, {
      bytes,
      meta: { scope, ref, sizeBytes, lastAccessMs: Date.now() },
    });
    this.#bytesUsed += sizeBytes;
  }

  #evictTo(targetBytes: number, reason: EvictionReason): number {
    if (this.#bytesUsed <= targetBytes) return 0;
    const ordered = [...this.#entries.entries()].sort(
      (a, b) => a[1].meta.lastAccessMs - b[1].meta.lastAccessMs,
    );
    let freed = 0;
    for (const [key, entry] of ordered) {
      if (this.#bytesUsed <= targetBytes) break;
      freed += entry.meta.sizeBytes;
      this.#removeKey(key, reason);
    }
    return freed;
  }

  #removeKey(key: string, reason: EvictionReason): void {
    const entry = this.#entries.get(key);
    if (!entry) return;
    this.#entries.delete(key);
    this.#bytesUsed -= entry.meta.sizeBytes;
    this.#emit("evicted", {
      scope: entry.meta.scope,
      ref: entry.meta.ref,
      sizeBytes: entry.meta.sizeBytes,
      reason,
    });
  }

  #emitPressure(): void {
    const now = Date.now();
    if (now - this.#lastPressureMs < PRESSURE_THROTTLE_MS) return;
    this.#lastPressureMs = now;
    this.#emit("budget-pressure", {
      bytesUsed: this.#bytesUsed,
      bytesBudget: this.#budgetBytes,
      trigger: "budget",
    });
  }

  #emit<E extends keyof BlobStoreEvents>(
    event: E,
    data: BlobStoreEvents[E],
  ): void {
    for (const listener of this.#listeners[event]) listener(data);
  }
}
