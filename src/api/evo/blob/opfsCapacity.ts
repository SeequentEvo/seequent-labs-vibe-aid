/**
 * Capacity-management helpers for `OpfsBlobStore`.
 *
 * Pure utilities and small stateful primitives extracted from
 * `opfsBlobStore.ts` to keep that file from drifting past the size cliff.
 *
 * Nothing here knows about the cache index map directly — the store passes
 * in the data it needs and reacts to the results.
 */

const HIGH_USAGE_RATIO = 0.9;
const TARGET_USAGE_RATIO = 0.7;
const PRESSURE_THROTTLE_MS = 1000;

/** Total bytes across an iterable of size-bearing entries. */
export const sumSizes = (
  entries: Iterable<{ readonly sizeBytes: number }>,
): number => {
  let n = 0;
  for (const e of entries) n += e.sizeBytes;
  return n;
};

/** Byte length of an `ArrayBuffer` or any `ArrayBufferView`. */
export const byteLengthOf = (bytes: BufferSource): number =>
  bytes instanceof ArrayBuffer ? bytes.byteLength : bytes.byteLength;

/**
 * Detect a quota-exceeded error from an OPFS write.
 *
 * Browsers historically use `QuotaExceededError`; some Chromium builds also
 * emit `NotEnoughSpaceError`. Both are surfaced as a `DOMException`.
 */
export const isQuotaError = (err: unknown): boolean => {
  if (err instanceof DOMException) {
    return (
      err.name === "QuotaExceededError" || err.name === "NotEnoughSpaceError"
    );
  }
  if (err instanceof Error && err.name === "QuotaExceededError") return true;
  return false;
};

/** Result of a browser-quota probe. */
export interface BrowserQuotaSnapshot {
  /** `navigator.storage.estimate().usage`, if available. */
  readonly usage?: number;
  /** `navigator.storage.estimate().quota`, if available. */
  readonly quota?: number;
  /** True when usage/quota crossed the high-water mark and we should evict. */
  readonly underPressure: boolean;
}

/**
 * Probe `navigator.storage.estimate()` for the browser-wide OPFS pressure
 * signal. Safe to call from any environment — returns `{underPressure: false}`
 * when the API is missing or throws (Safari historically rejected this).
 */
export const probeBrowserQuota = async (): Promise<BrowserQuotaSnapshot> => {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.storage === "undefined" ||
    typeof navigator.storage.estimate !== "function"
  ) {
    return { underPressure: false };
  }
  let usage: number | undefined;
  let quota: number | undefined;
  try {
    const est = await navigator.storage.estimate();
    usage = est.usage;
    quota = est.quota;
  } catch {
    return { underPressure: false };
  }
  if (usage === undefined || quota === undefined || quota <= 0) {
    return { usage, quota, underPressure: false };
  }
  return { usage, quota, underPressure: usage / quota > HIGH_USAGE_RATIO };
};

/**
 * Compute the cache-internal byte target needed to bring browser-wide OPFS
 * usage back below `TARGET_USAGE_RATIO`.
 *
 * We can only evict our own entries, so the best we can do is free
 * `usage - quota * TARGET_USAGE_RATIO` worth of bytes. Returns the cap on
 * `currentBytes` after eviction, never below zero.
 */
export const computeBrowserQuotaTarget = (
  currentBytes: number,
  usage: number,
  quota: number,
): number => {
  const bytesToFree = Math.max(0, Math.ceil(usage - quota * TARGET_USAGE_RATIO));
  return Math.max(0, currentBytes - bytesToFree);
};

/**
 * Tiny throttle that guarantees at most one event per `PRESSURE_THROTTLE_MS`
 * window, regardless of which trigger asked. Keeps the budget-pressure
 * stream calm even when both the budget and browser-quota paths fire on
 * the same write.
 */
export class PressureThrottle {
  #lastFiredMs = Number.NEGATIVE_INFINITY;

  /** Returns true if the caller is allowed to fire now. */
  allow(now: number = Date.now()): boolean {
    if (now - this.#lastFiredMs < PRESSURE_THROTTLE_MS) return false;
    this.#lastFiredMs = now;
    return true;
  }
}

/**
 * Wrap a writable stream so that `close()` and `abort()` both run a
 * settle hook after the underlying call resolves. Used to unpin in-flight
 * write reservations and commit final sizes.
 */
export function wrapWritable(
  stream: FileSystemWritableFileStream,
  onSettle: (outcome: "close" | "abort") => Promise<void>,
): FileSystemWritableFileStream {
  let settled = false;
  const settle = async (outcome: "close" | "abort"): Promise<void> => {
    if (settled) return;
    settled = true;
    await onSettle(outcome);
  };
  return new Proxy(stream, {
    get(target, prop) {
      if (prop === "close") {
        return async (): Promise<void> => {
          try {
            await target.close();
          } finally {
            await settle("close");
          }
        };
      }
      if (prop === "abort") {
        return async (reason?: unknown): Promise<void> => {
          try {
            await target.abort(reason);
          } finally {
            await settle("abort");
          }
        };
      }
      const value = Reflect.get(target, prop, target) as unknown;
      if (typeof value === "function") {
        return (value as (...args: unknown[]) => unknown).bind(target);
      }
      return value;
    },
  });
}
