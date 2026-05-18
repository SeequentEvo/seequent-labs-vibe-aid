import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { parseOrgId, parseWorkspaceId } from "@/types/ids";
import { InMemoryBlobStore } from "./inMemoryBlobStore";
import { cacheKeyPath } from "./store";
import {
  asBlobRef,
  BlobStoreQuotaError,
  type BlobRef,
  type CacheScope,
} from "./types";

const orgA = parseOrgId("11111111-1111-4111-8111-111111111111");
const orgB = parseOrgId("22222222-2222-4222-8222-222222222222");
const wsA = parseWorkspaceId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
const wsB = parseWorkspaceId("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");

const scopeAObj: CacheScope = {
  orgId: orgA,
  workspaceId: wsA,
  kind: "geoscience-object",
};
const scopeAFile: CacheScope = {
  orgId: orgA,
  workspaceId: wsA,
  kind: "file",
};
const scopeBObj: CacheScope = {
  orgId: orgB,
  workspaceId: wsB,
  kind: "geoscience-object",
};

const ref = (id: string): BlobRef => asBlobRef(id);
const buf = (size: number, fill = 0): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(size));
  out.fill(fill);
  return out;
};

describe("InMemoryBlobStore", () => {
  it("round-trips put/openRead across scopes", async () => {
    const store = new InMemoryBlobStore();
    await store.put(scopeAObj, ref("a"), buf(4, 1));
    await store.put(scopeAFile, ref("a"), buf(8, 2));

    const blobObj = await store.openRead(scopeAObj, ref("a"));
    const blobFile = await store.openRead(scopeAFile, ref("a"));
    expect(new Uint8Array(await blobObj.arrayBuffer())).toEqual(buf(4, 1));
    expect(new Uint8Array(await blobFile.arrayBuffer())).toEqual(buf(8, 2));
  });

  it("has and size return correct values", async () => {
    const store = new InMemoryBlobStore();
    expect(await store.has(scopeAObj, ref("x"))).toBe(false);
    expect(await store.size(scopeAObj, ref("x"))).toBeUndefined();
    await store.put(scopeAObj, ref("x"), buf(16));
    expect(await store.has(scopeAObj, ref("x"))).toBe(true);
    expect(await store.size(scopeAObj, ref("x"))).toBe(16);
  });

  it("clear / clearInstance / clearAll remove the right entries", async () => {
    const store = new InMemoryBlobStore();
    await store.put(scopeAObj, ref("1"), buf(1));
    await store.put(scopeAFile, ref("2"), buf(1));
    await store.put(scopeBObj, ref("3"), buf(1));

    await store.clear(scopeAObj);
    expect(await store.has(scopeAObj, ref("1"))).toBe(false);
    expect(await store.has(scopeAFile, ref("2"))).toBe(true);

    await store.clearInstance(orgA);
    expect(await store.has(scopeAFile, ref("2"))).toBe(false);
    expect(await store.has(scopeBObj, ref("3"))).toBe(true);

    await store.clearAll();
    expect((await store.getUsage()).entries).toBe(0);
  });

  it("getUsage filters by partial scope", async () => {
    const store = new InMemoryBlobStore();
    await store.put(scopeAObj, ref("1"), buf(10));
    await store.put(scopeAFile, ref("2"), buf(20));
    await store.put(scopeBObj, ref("3"), buf(40));

    expect(await store.getUsage()).toEqual({ bytes: 70, entries: 3 });
    expect(await store.getUsage({ orgId: orgA })).toEqual({
      bytes: 30,
      entries: 2,
    });
    expect(
      await store.getUsage({
        orgId: orgA,
        workspaceId: wsA,
        kind: "file",
      }),
    ).toEqual({ bytes: 20, entries: 1 });
  });

  describe("LRU eviction", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("evicts the oldest entry first when over budget", async () => {
      const store = new InMemoryBlobStore({ budgetBytes: 30 });
      const evicted: BlobRef[] = [];
      store.on("evicted", (e) => {
        if (e.reason === "lru-budget") evicted.push(e.ref);
      });

      await store.put(scopeAObj, ref("oldest"), buf(10));
      vi.advanceTimersByTime(1000);
      await store.put(scopeAObj, ref("middle"), buf(10));
      vi.advanceTimersByTime(1000);
      await store.put(scopeAObj, ref("newest"), buf(10));
      // Cache full. Adding 10 more triggers eviction of 'oldest'.
      vi.advanceTimersByTime(1000);
      await store.put(scopeAObj, ref("fresh"), buf(10));

      expect(evicted).toEqual([ref("oldest")]);
      expect(await store.has(scopeAObj, ref("oldest"))).toBe(false);
      expect(await store.has(scopeAObj, ref("middle"))).toBe(true);
      expect((await store.getUsage()).bytes).toBe(30);
    });

    it("throws BlobStoreQuotaError when blob alone exceeds budget", async () => {
      const store = new InMemoryBlobStore({ budgetBytes: 8 });
      const quotaEvents: { ref: BlobRef; sizeBytes: number }[] = [];
      store.on("quota-error", (e) => quotaEvents.push(e));

      await expect(
        store.put(scopeAObj, ref("big"), buf(64)),
      ).rejects.toBeInstanceOf(BlobStoreQuotaError);
      expect(quotaEvents).toHaveLength(1);
      expect(quotaEvents[0]?.sizeBytes).toBe(64);
    });

    it("throttles budget-pressure to ≤1 per second", async () => {
      const store = new InMemoryBlobStore({ budgetBytes: 10 });
      const pressures: number[] = [];
      store.on("budget-pressure", (e) => pressures.push(e.bytesUsed));

      // Pre-fill so each subsequent put triggers eviction.
      await store.put(scopeAObj, ref("a"), buf(10));
      vi.advanceTimersByTime(100);
      await store.put(scopeAObj, ref("b"), buf(10));
      vi.advanceTimersByTime(100);
      await store.put(scopeAObj, ref("c"), buf(10));
      // First eviction-triggering put fires; subsequent ones <1s suppressed.
      expect(pressures).toHaveLength(1);

      vi.advanceTimersByTime(1100);
      await store.put(scopeAObj, ref("d"), buf(10));
      expect(pressures).toHaveLength(2);
    });
  });

  it("openWrite assembles position-based chunked writes", async () => {
    const store = new InMemoryBlobStore();
    const stream = await store.openWrite(scopeAObj, ref("chunked"), 12);

    await stream.write({ type: "write", position: 8, data: buf(4, 9) });
    await stream.write({ type: "write", position: 0, data: buf(4, 1) });
    await stream.write({ type: "write", position: 4, data: buf(4, 5) });
    await stream.close();

    const out = new Uint8Array(
      await (await store.openRead(scopeAObj, ref("chunked"))).arrayBuffer(),
    );
    expect(out).toEqual(
      new Uint8Array([1, 1, 1, 1, 5, 5, 5, 5, 9, 9, 9, 9]),
    );
  });

  it("openWrite abort discards the entry", async () => {
    const store = new InMemoryBlobStore();
    const stream = await store.openWrite(scopeAObj, ref("abandon"), 4);
    await stream.write({ type: "write", position: 0, data: buf(4, 7) });
    await stream.abort();
    expect(await store.has(scopeAObj, ref("abandon"))).toBe(false);
    expect(await store.getUsage()).toEqual({ bytes: 0, entries: 0 });
    expect(cacheKeyPath(scopeAObj, ref("abandon"))).toContain("abandon");
  });

  it("on() returns a working unsubscribe function", async () => {
    const store = new InMemoryBlobStore();
    const seen: BlobRef[] = [];
    const unsubscribe = store.on("evicted", (e) => seen.push(e.ref));

    await store.put(scopeAObj, ref("k"), buf(4));
    await store.delete(scopeAObj, ref("k"));
    expect(seen).toEqual([ref("k")]);

    unsubscribe();
    await store.put(scopeAObj, ref("k2"), buf(4));
    await store.delete(scopeAObj, ref("k2"));
    expect(seen).toEqual([ref("k")]);
  });

  it("evictUntil emits 'manual' eviction events", async () => {
    const store = new InMemoryBlobStore();
    const reasons: string[] = [];
    store.on("evicted", (e) => reasons.push(e.reason));

    await store.put(scopeAObj, ref("a"), buf(10));
    await store.put(scopeAObj, ref("b"), buf(10));
    const freed = await store.evictUntil(0);
    expect(freed).toBe(20);
    expect(reasons).toEqual(["manual", "manual"]);
  });
});
