import { describe, it, expect, afterEach, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";

import { InMemoryBlobStore } from "@/api/evo/blob/inMemoryBlobStore";
import { asBlobRef, type CacheScope } from "@/api/evo/blob/types";
import { parseOrgId, parseWorkspaceId } from "@/types/ids";
import {
  blobCacheActions,
  blobCacheReducer,
  selectBlobCache,
  subscribeBlobCacheToStore,
  type BlobCacheState,
} from "./blobCacheSlice";

const orgId = parseOrgId("11111111-1111-4111-8111-111111111111");
const workspaceId = parseWorkspaceId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
const scope: CacheScope = { orgId, workspaceId, kind: "geoscience-object" };

const buf = (size: number, fill = 1): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(size));
  out.fill(fill);
  return out;
};

const makeStore = () =>
  configureStore({ reducer: { blobCache: blobCacheReducer } });

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const initial: BlobCacheState = {
  bytesUsed: 0,
  bytesBudget: 0,
  lastPressureAt: null,
  lastPressureTrigger: null,
  lastQuotaErrorAt: null,
  lastEvictedAt: null,
  evictedSinceMount: 0,
};

describe("blobCacheSlice", () => {
  describe("reducer", () => {
    it("starts with default state", () => {
      const store = makeStore();
      expect(selectBlobCache(store.getState())).toEqual(initial);
    });

    it("setUsage updates bytesUsed/bytesBudget", () => {
      const store = makeStore();
      store.dispatch(
        blobCacheActions.setUsage({ bytesUsed: 42, bytesBudget: 100 }),
      );
      const s = selectBlobCache(store.getState());
      expect(s.bytesUsed).toBe(42);
      expect(s.bytesBudget).toBe(100);
    });

    it("evictedFired increments counter and timestamps", () => {
      const store = makeStore();
      store.dispatch(blobCacheActions.evictedFired({ at: 10, bytesFreed: 5 }));
      store.dispatch(blobCacheActions.evictedFired({ at: 20, bytesFreed: 7 }));
      const s = selectBlobCache(store.getState());
      expect(s.evictedSinceMount).toBe(2);
      expect(s.lastEvictedAt).toBe(20);
    });

    it("reset returns initial state", () => {
      const store = makeStore();
      store.dispatch(
        blobCacheActions.setUsage({ bytesUsed: 99, bytesBudget: 200 }),
      );
      store.dispatch(blobCacheActions.evictedFired({ at: 1, bytesFreed: 1 }));
      store.dispatch(blobCacheActions.reset());
      expect(selectBlobCache(store.getState())).toEqual(initial);
    });
  });

  describe("subscribeBlobCacheToStore", () => {
    let unsubscribe: () => void = () => undefined;

    afterEach(() => {
      unsubscribe();
      unsubscribe = () => undefined;
      vi.useRealTimers();
    });

    it("updates state from eviction-triggering put", async () => {
      const reduxStore = makeStore();
      const blobStore = new InMemoryBlobStore({ budgetBytes: 10 });
      unsubscribe = subscribeBlobCacheToStore(reduxStore.dispatch, blobStore, {
        usagePollMs: 0,
      });

      await blobStore.put(scope, asBlobRef("a"), buf(6));
      await blobStore.put(scope, asBlobRef("b"), buf(6)); // evicts "a"
      await flush();

      const s = selectBlobCache(reduxStore.getState());
      expect(s.lastPressureAt).not.toBeNull();
      expect(s.lastPressureTrigger).toBe("budget");
      expect(s.lastEvictedAt).not.toBeNull();
      expect(s.evictedSinceMount).toBeGreaterThanOrEqual(1);
      expect(s.bytesUsed).toBe(6);
    });

    it("records quota errors when a put exceeds the budget alone", async () => {
      const reduxStore = makeStore();
      const blobStore = new InMemoryBlobStore({ budgetBytes: 4 });
      unsubscribe = subscribeBlobCacheToStore(reduxStore.dispatch, blobStore, {
        usagePollMs: 0,
      });

      await expect(
        blobStore.put(scope, asBlobRef("big"), buf(8)),
      ).rejects.toThrow();
      await flush();

      const s = selectBlobCache(reduxStore.getState());
      expect(s.lastQuotaErrorAt).not.toBeNull();
    });

    it("unsubscribe detaches all listeners", async () => {
      const reduxStore = makeStore();
      const blobStore = new InMemoryBlobStore({ budgetBytes: 10 });
      const unsub = subscribeBlobCacheToStore(reduxStore.dispatch, blobStore, {
        usagePollMs: 0,
      });
      await flush();
      unsub();

      const before = selectBlobCache(reduxStore.getState());
      await blobStore.put(scope, asBlobRef("a"), buf(6));
      await blobStore.put(scope, asBlobRef("b"), buf(6)); // evicts
      await flush();

      const after = selectBlobCache(reduxStore.getState());
      expect(after).toEqual(before);
    });

    it("polls getUsage on the configured interval", async () => {
      vi.useFakeTimers();
      const reduxStore = makeStore();
      const blobStore = new InMemoryBlobStore({ budgetBytes: 1024 });
      const spy = vi.spyOn(blobStore, "getUsage");
      unsubscribe = subscribeBlobCacheToStore(reduxStore.dispatch, blobStore, {
        usagePollMs: 1000,
      });

      // Initial prime call.
      const initialCalls = spy.mock.calls.length;

      // Drop bytes into the store *without* triggering eviction so the
      // only path to refresh state is the poll.
      await blobStore.put(scope, asBlobRef("a"), buf(16));

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(0);

      expect(spy.mock.calls.length).toBeGreaterThan(initialCalls);
      expect(selectBlobCache(reduxStore.getState()).bytesUsed).toBe(16);
    });
  });
});
