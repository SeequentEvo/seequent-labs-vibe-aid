/**
 * Locks helper for `OpfsBlobStore`.
 *
 * OPFS is shared across all tabs of an origin, so any read-modify-write of
 * `index.json` (or of a per-blob file two tabs are racing to download) needs
 * to be serialised cross-tab. We use the **Web Locks API**
 * (`navigator.locks`) when available; otherwise we fall back to a per-store
 * promise chain (single-tab assumption only).
 *
 * Two locks are exposed:
 *
 *   - `withIndex` — exclusive lock named `evo-blob-cache:index`. Held for
 *     the lifetime of every index mutation (load/mtime-check → mutate →
 *     persist → release).
 *   - `withWrite(key)` — exclusive lock named `evo-blob-cache:write:<key>`,
 *     where `<key>` is `cacheKeyPath(scope, ref)`. Held for the lifetime
 *     of a single-blob write so two tabs racing the same download serialise.
 *
 * The two locks compose: a `put` first acquires the per-ref write lock,
 * re-checks `has` (short-circuit if a peer tab already finished), then
 * does its index-locked work inside the write lock.
 */

export interface LocksAdapter {
  withIndex<T>(fn: () => Promise<T>): Promise<T>;
  withWrite<T>(key: string, fn: () => Promise<T>): Promise<T>;
}

const INDEX_LOCK_NAME = "evo-blob-cache:index";
const WRITE_LOCK_PREFIX = "evo-blob-cache:write:";

class WebLocksAdapter implements LocksAdapter {
  withIndex<T>(fn: () => Promise<T>): Promise<T> {
    return navigator.locks.request(
      INDEX_LOCK_NAME,
      { mode: "exclusive" },
      async () => fn(),
    ) as Promise<T>;
  }

  withWrite<T>(key: string, fn: () => Promise<T>): Promise<T> {
    return navigator.locks.request(
      `${WRITE_LOCK_PREFIX}${key}`,
      { mode: "exclusive" },
      async () => fn(),
    ) as Promise<T>;
  }
}

class FallbackLocksAdapter implements LocksAdapter {
  private indexChain: Promise<unknown> = Promise.resolve();
  private readonly keyChains = new Map<string, Promise<unknown>>();

  withIndex<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.indexChain.then(fn, fn);
    this.indexChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  withWrite<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.keyChains.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const completion: Promise<unknown> = next.then(
      () => undefined,
      () => undefined,
    );
    this.keyChains.set(key, completion);
    void completion.then(() => {
      if (this.keyChains.get(key) === completion) {
        this.keyChains.delete(key);
      }
    });
    return next;
  }
}

let warnedNoLocks = false;
const warnLocksUnavailable = (): void => {
  if (warnedNoLocks) return;
  warnedNoLocks = true;
  console.warn(
    "[OpfsBlobStore] navigator.locks unavailable; multi-tab safety disabled, single-tab assumption only.",
  );
};

/**
 * Pick the best available locks adapter. If `navigator.locks` is missing
 * we log once and return the per-store promise-chain fallback.
 */
export const createLocksAdapter = (): LocksAdapter => {
  if (
    typeof navigator !== "undefined" &&
    "locks" in navigator &&
    navigator.locks !== undefined &&
    typeof navigator.locks.request === "function"
  ) {
    return new WebLocksAdapter();
  }
  warnLocksUnavailable();
  return new FallbackLocksAdapter();
};

/** Test-only: build a fallback adapter directly (skips the warn-once). */
export const createFallbackLocksAdapter = (): LocksAdapter =>
  new FallbackLocksAdapter();
