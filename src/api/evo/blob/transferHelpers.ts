/**
 * Shared helpers for chunked blob transfers (upload + download).
 *
 * Exposes:
 * - `isRetryableStatus` — Azure Blob retry classification (5xx, 408, 429).
 * - `withRetry`         — exponential backoff with jitter, abort-aware.
 * - `createProgressEmitter` — throttled `ProgressEvent` emitter with a
 *   `flush()` for the final post-commit event.
 *
 * Kept transport-agnostic so both `upload.ts` and `download.ts` can import
 * them without circular dependencies on each other.
 */

import type { ProgressEvent } from "./types";

/** HTTP status codes worth retrying on for Azure Blob operations. */
export const isRetryableStatus = (status: number): boolean =>
  status === 408 || status === 429 || (status >= 500 && status < 600);

/** Async sleep that rejects with `AbortError` if `signal` aborts first. */
export const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(toAbortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(toAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

export const toAbortError = (): DOMException =>
  new DOMException("aborted", "AbortError");

export const isAbortError = (err: unknown): boolean =>
  err instanceof DOMException && err.name === "AbortError";

export interface RetryOptions {
  readonly maxRetries: number;
  readonly baseMs: number;
  readonly signal?: AbortSignal;
  /** Decide whether `err` is retryable. Defaults: network rejects + 5xx/408/429 via `RetryableHttpError`. */
  readonly shouldRetry?: (err: unknown) => boolean;
}

/**
 * Marker error: thrown by retry-aware fetch wrappers when an HTTP response
 * carries a retryable status code. `withRetry` recognises this so callers
 * can `throw new RetryableHttpError(status)` from within `op` to signal
 * "this attempt failed, please retry".
 */
export class RetryableHttpError extends Error {
  override readonly name = "RetryableHttpError";
  readonly status: number;
  constructor(status: number, message?: string) {
    super(message ?? `Retryable HTTP status ${String(status)}`);
    this.status = status;
  }
}

/**
 * Non-retryable HTTP failure (e.g. 4xx other than 408/429). Carries the
 * status so callers can surface it in `BlobTransferError.cause`.
 */
export class HttpError extends Error {
  override readonly name = "HttpError";
  readonly status: number;
  constructor(status: number, message?: string) {
    super(message ?? `HTTP ${String(status)}`);
    this.status = status;
  }
}

const defaultShouldRetry = (err: unknown): boolean => {
  if (isAbortError(err)) return false;
  if (err instanceof RetryableHttpError) return true;
  if (err instanceof HttpError) return false;
  // Network-level failures (TypeError from fetch, generic Error from mocks).
  return true;
};

const jitter = (ms: number): number => {
  // ±25% jitter
  const delta = ms * 0.25;
  return ms - delta + Math.random() * (2 * delta);
};

/**
 * Run `op` with exponential backoff. The first call is attempt 0; on
 * failure attempts up to `maxRetries` retries (so up to `maxRetries + 1`
 * total invocations). Backoff: `baseMs * 2^attempt`, jittered ±25%.
 */
export const withRetry = async <T>(
  op: (attempt: number) => Promise<T>,
  opts: RetryOptions,
): Promise<T> => {
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt += 1) {
    if (opts.signal?.aborted) throw toAbortError();
    try {
      return await op(attempt);
    } catch (err) {
      lastErr = err;
      if (isAbortError(err)) throw err;
      if (attempt === opts.maxRetries || !shouldRetry(err)) throw err;
      const delay = jitter(opts.baseMs * Math.pow(2, attempt));
      await sleep(delay, opts.signal);
    }
  }
  // Unreachable: the loop either returns or throws.
  throw lastErr;
};

/**
 * Throttled progress emitter. Coalesces rapid `add(n)` calls into at most
 * one `onProgress` invocation per `intervalMs`. `flush()` forces the most
 * recent value to be delivered (used after commit to fire the final event).
 */
export interface ProgressEmitter {
  add(bytes: number): void;
  flush(): void;
  readonly transferred: number;
}

export const createProgressEmitter = (
  total: number,
  onProgress: ((e: ProgressEvent) => void) | undefined,
  intervalMs = 50,
): ProgressEmitter => {
  let transferred = 0;
  let lastEmitMs = 0;
  let lastEmittedValue = -1;

  const emitNow = (): void => {
    if (!onProgress) return;
    if (transferred === lastEmittedValue) return;
    lastEmittedValue = transferred;
    lastEmitMs = Date.now();
    onProgress({ transferred, total });
  };

  return {
    add(bytes: number): void {
      transferred += bytes;
      if (!onProgress) return;
      const now = Date.now();
      if (now - lastEmitMs >= intervalMs) emitNow();
    },
    flush(): void {
      emitNow();
    },
    get transferred(): number {
      return transferred;
    },
  };
};
