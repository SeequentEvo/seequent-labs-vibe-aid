/**
 * `blobCache` slice — pure data mirror of `BlobStore` budget telemetry.
 *
 * The slice itself contains no side-effects; subscription wiring lives in
 * `subscribeBlobCacheToStore` so the store can be swapped (e.g. an
 * `InMemoryBlobStore` in tests, the `OpfsBlobStore` in production).
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { BlobStore } from "@/api/evo/blob/store";
import type { PressureTrigger } from "@/api/evo/blob/types";
import type { AppDispatch } from "@/store";

export interface BlobCacheState {
  bytesUsed: number;
  bytesBudget: number;
  lastPressureAt: number | null;
  lastPressureTrigger: PressureTrigger | null;
  lastQuotaErrorAt: number | null;
  lastEvictedAt: number | null;
  evictedSinceMount: number;
}

const initialState: BlobCacheState = {
  bytesUsed: 0,
  bytesBudget: 0,
  lastPressureAt: null,
  lastPressureTrigger: null,
  lastQuotaErrorAt: null,
  lastEvictedAt: null,
  evictedSinceMount: 0,
};

const slice = createSlice({
  name: "blobCache",
  initialState,
  reducers: {
    setUsage(
      state,
      action: PayloadAction<{ bytesUsed: number; bytesBudget: number }>,
    ) {
      state.bytesUsed = action.payload.bytesUsed;
      state.bytesBudget = action.payload.bytesBudget;
    },
    pressureFired(
      state,
      action: PayloadAction<{
        at: number;
        trigger: PressureTrigger;
        bytesUsed: number;
        bytesBudget: number;
      }>,
    ) {
      state.lastPressureAt = action.payload.at;
      state.lastPressureTrigger = action.payload.trigger;
      state.bytesUsed = action.payload.bytesUsed;
      state.bytesBudget = action.payload.bytesBudget;
    },
    quotaErrorFired(state, action: PayloadAction<{ at: number }>) {
      state.lastQuotaErrorAt = action.payload.at;
    },
    evictedFired(
      state,
      action: PayloadAction<{ at: number; bytesFreed: number }>,
    ) {
      state.lastEvictedAt = action.payload.at;
      state.evictedSinceMount += 1;
      // bytesFreed is informational; bytesUsed is refreshed via setUsage.
      void action.payload.bytesFreed;
    },
    reset() {
      return { ...initialState };
    },
  },
});

export const { reducer: blobCacheReducer, actions: blobCacheActions } = slice;

export const selectBlobCache = (state: {
  blobCache: BlobCacheState;
}): BlobCacheState => state.blobCache;

interface SubscribeOptions {
  /** Poll interval (ms) for periodic `getUsage()` refresh. Default 5000. */
  usagePollMs?: number;
}

const isPageVisible = (): boolean => {
  if (typeof document === "undefined") return true;
  return document.visibilityState !== "hidden";
};

/**
 * Subscribe a Redux store to a `BlobStore`. Returns an unsubscribe that
 * detaches all listeners and stops polling. Call once at app start with
 * the production `BlobStore` instance.
 */
export function subscribeBlobCacheToStore(
  reduxDispatch: AppDispatch,
  store: BlobStore,
  options: SubscribeOptions = {},
): () => void {
  const pollMs = options.usagePollMs ?? 5000;
  let disposed = false;

  const refreshUsage = async (currentBudget?: number): Promise<void> => {
    try {
      const usage = await store.getUsage();
      if (disposed) return;
      reduxDispatch(
        blobCacheActions.setUsage({
          bytesUsed: usage.bytes,
          bytesBudget: currentBudget ?? 0,
        }),
      );
    } catch {
      // getUsage failures are non-fatal; we'll retry on next event/poll.
    }
  };

  const unsubPressure = store.on("budget-pressure", (data) => {
    reduxDispatch(
      blobCacheActions.pressureFired({
        at: Date.now(),
        trigger: data.trigger,
        bytesUsed: data.bytesUsed,
        bytesBudget: data.bytesBudget,
      }),
    );
  });

  const unsubEvicted = store.on("evicted", (data) => {
    reduxDispatch(
      blobCacheActions.evictedFired({
        at: Date.now(),
        bytesFreed: data.sizeBytes,
      }),
    );
    // Defer so any in-flight `put` commit finishes before we re-read usage.
    queueMicrotask(() => {
      void refreshUsage();
    });
  });

  const unsubQuota = store.on("quota-error", () => {
    reduxDispatch(blobCacheActions.quotaErrorFired({ at: Date.now() }));
    queueMicrotask(() => {
      void refreshUsage();
    });
  });

  const intervalId =
    pollMs > 0
      ? setInterval(() => {
          if (!isPageVisible()) return;
          void refreshUsage();
        }, pollMs)
      : null;

  // Prime state with an initial reading.
  void refreshUsage();

  return () => {
    disposed = true;
    unsubPressure();
    unsubEvicted();
    unsubQuota();
    if (intervalId !== null) clearInterval(intervalId);
  };
}
