// @vitest-environment node
/**
 * End-to-end integration tests for the binary blob layer.
 *
 * These exercise the full pipeline (parquet → cache → upload → re-download
 * → read) against `InMemoryBlobStore` and the local `MockAzureServer`.
 */

import { configureStore } from "@reduxjs/toolkit";
import { tableFromIPC } from "apache-arrow";
import { describe, expect, it } from "vitest";

import { parseOrgId, parseWorkspaceId } from "@/types/ids";
import {
  blobCacheReducer,
  subscribeBlobCacheToStore,
} from "@/store/blobCacheSlice";
import {
  asBlobRef,
  BlobStoreQuotaError,
  decodeParquet,
  downloadToStore,
  encodeParquet,
  InMemoryBlobStore,
  readParquetFromCache,
  uploadFromStore,
  writeParquetToCache,
  type BlobRef,
  type CacheScope,
  type DownloadFn,
  type DownloadOptions,
  type ProgressEvent,
  type Table,
} from "@/api/evo/blob";

import { buildParquetTable } from "./__tests__/buildParquetTable";
import { MockAzureServer } from "./__tests__/mockAzure";

const orgId = parseOrgId("11111111-1111-4111-8111-111111111111");
const workspaceId = parseWorkspaceId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
const scope: CacheScope = { orgId, workspaceId, kind: "geoscience-object" };

/* -------------------------------------------------------------------------- */
/* Parquet helpers                                                            */
/* -------------------------------------------------------------------------- */

interface BuiltTable {
  readonly table: Table;
  readonly columns: { id: number[]; name: string[] };
}

async function buildTable(
  ids: number[] = [10, 20, 30],
  names: string[] = ["x", "y", "z"],
): Promise<BuiltTable> {
  const table = await buildParquetTable({
    ids: Int32Array.from(ids),
    names,
  });
  return { table, columns: { id: ids, name: names } };
}

const assertColumns = (
  table: Table,
  expected: { id: number[]; name: string[] },
): void => {
  const arrowTable = tableFromIPC(table.intoIPCStream());
  expect(arrowTable.numRows).toBe(expected.id.length);
  const idChild = arrowTable.getChild("id");
  const nameChild = arrowTable.getChild("name");
  expect(idChild).not.toBeNull();
  expect(nameChild).not.toBeNull();
  expect(Array.from(idChild!.toArray() as Int32Array)).toEqual(expected.id);
  expect(Array.from(nameChild!.toArray() as string[])).toEqual(expected.name);
};

/* -------------------------------------------------------------------------- */
/* Test-scoped helpers                                                        */
/* -------------------------------------------------------------------------- */

interface UploadFixture {
  readonly server: MockAzureServer;
  readonly path: string;
  readonly url: string;
}

const newUploadFixture = (refStr: string): UploadFixture => {
  const server = new MockAzureServer();
  const path = `/container/${refStr}`;
  return { server, path, url: server.urlFor(path) };
};

/** Build a `download` injection that pins chunkSize/parallelism + fetchImpl. */
const chunkedDownload = (
  fetchImpl: typeof fetch,
  chunkSize: number,
  parallelism = 1,
): DownloadFn => {
  return (opts: DownloadOptions): Promise<void> =>
    downloadToStore({ ...opts, chunkSize, parallelism, fetchImpl });
};

/* -------------------------------------------------------------------------- */
/* Tests                                                                      */
/* -------------------------------------------------------------------------- */

describe("blob layer — end-to-end integration", () => {
  it("round trips: write → upload → re-download → read", async () => {
    const store = new InMemoryBlobStore();
    const built = await buildTable();

    const { ref, bytes } = await writeParquetToCache({
      store,
      scope,
      table: built.table,
    });

    const fixture = newUploadFixture(ref);

    await uploadFromStore({
      store,
      scope,
      ref,
      uploadUrl: fixture.url,
      fetchImpl: fixture.server.fetch,
    });

    // Drop the cached entry so the read is forced to download.
    await store.delete(scope, ref);
    expect(await store.has(scope, ref)).toBe(false);

    const decoded = await readParquetFromCache({
      store,
      scope,
      ref,
      resolveDownload: () =>
        Promise.resolve({ url: fixture.url, totalSize: bytes }),
      download: chunkedDownload(fixture.server.fetch, bytes),
    });

    assertColumns(decoded, built.columns);
    expect(await store.has(scope, ref)).toBe(true);
  });

  it("short-circuits subsequent reads from cache (no second GET)", async () => {
    const store = new InMemoryBlobStore();
    const built = await buildTable([1, 2], ["a", "b"]);
    const encoded = await encodeParquet(built.table);
    const ref = asBlobRef("cached-ref-shortcircuit");

    const fixture = newUploadFixture(ref);
    fixture.server.preload(fixture.path, encoded);

    const resolveDownload = () =>
      Promise.resolve({ url: fixture.url, totalSize: encoded.byteLength });

    const first = await readParquetFromCache({
      store,
      scope,
      ref,
      resolveDownload,
      download: chunkedDownload(fixture.server.fetch, encoded.byteLength),
    });
    assertColumns(first, built.columns);

    const second = await readParquetFromCache({
      store,
      scope,
      ref,
      resolveDownload,
      download: chunkedDownload(fixture.server.fetch, encoded.byteLength),
    });
    assertColumns(second, built.columns);

    // Only one GET against the URL — second read came from the cache.
    expect(fixture.server.counts.gets.get(fixture.path)).toBe(1);
  });

  it("evicts oldest entries during a sequential load and reports pressure to redux", async () => {
    const built = await buildTable();
    const encoded = await encodeParquet(built.table);
    const blobSize = encoded.byteLength;
    // Budget large enough to hold ~3 blobs but not 10.
    const budget = blobSize * 3 + Math.floor(blobSize / 2);
    const store = new InMemoryBlobStore({ budgetBytes: budget });

    const reduxStore = configureStore({ reducer: { blobCache: blobCacheReducer } });
    const unsubscribe = subscribeBlobCacheToStore(reduxStore.dispatch, store, {
      usagePollMs: 0,
    });

    try {
      const server = new MockAzureServer();
      const refs: BlobRef[] = [];
      for (let i = 0; i < 10; i += 1) {
        // Use distinct refs so each blob occupies its own cache slot. The
        // bytes-on-the-wire are identical so we can re-use `encoded`.
        const ref = asBlobRef(`load-batch-ref-${String(i).padStart(2, "0")}`);
        refs.push(ref);
        const path = `/container/${ref}`;
        server.preload(path, encoded);

        await readParquetFromCache({
          store,
          scope,
          ref,
          resolveDownload: () =>
            Promise.resolve({ url: server.urlFor(path), totalSize: blobSize }),
          download: chunkedDownload(server.fetch, blobSize),
        });
      }

      // Cache must respect the budget — at most floor(budget/blobSize) entries
      // remain after the run.
      const usage = await store.getUsage();
      expect(usage.bytes).toBeLessThanOrEqual(budget);
      expect(usage.entries).toBeLessThan(refs.length);

      // Oldest refs got evicted.
      expect(await store.has(scope, refs[0]!)).toBe(false);
      // Most-recent ref is still present.
      expect(await store.has(scope, refs.at(-1)!)).toBe(true);

      // Redux mirror picked up at least one eviction + a pressure event.
      // Allow a microtask to flush so the queued refreshUsage runs.
      await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
      });
      const state = reduxStore.getState().blobCache;
      expect(state.evictedSinceMount).toBeGreaterThan(0);
      expect(state.lastPressureAt).not.toBeNull();
    } finally {
      unsubscribe();
    }
  });

  it("propagates BlobStoreQuotaError through writeParquetToCache when over budget", async () => {
    const store = new InMemoryBlobStore({ budgetBytes: 16 });
    const built = await buildTable();

    await expect(
      writeParquetToCache({ store, scope, table: built.table }),
    ).rejects.toBeInstanceOf(BlobStoreQuotaError);
  });

  it("concurrent readParquetFromCache calls each launch their own download (InMemoryBlobStore has no per-ref locks)", async () => {
    const store = new InMemoryBlobStore();
    const built = await buildTable();
    const encoded = await encodeParquet(built.table);
    const ref = asBlobRef("concurrent-read-ref");

    const server = new MockAzureServer({ delayMs: 20 });
    const path = `/container/${ref}`;
    server.preload(path, encoded);

    const resolveDownload = () =>
      Promise.resolve({ url: server.urlFor(path), totalSize: encoded.byteLength });

    const [a, b] = await Promise.all([
      readParquetFromCache({
        store,
        scope,
        ref,
        resolveDownload,
        download: chunkedDownload(server.fetch, encoded.byteLength),
      }),
      readParquetFromCache({
        store,
        scope,
        ref,
        resolveDownload,
        download: chunkedDownload(server.fetch, encoded.byteLength),
      }),
    ]);

    assertColumns(a, built.columns);
    assertColumns(b, built.columns);

    // Documented behaviour: InMemoryBlobStore has no Web-Locks dedup, so
    // each concurrent read may launch its own GET. We expect at most one
    // per call (i.e. ≤ 2 total) — anything more means a spurious refetch.
    const gets = server.counts.gets.get(path) ?? 0;
    expect(gets).toBeGreaterThanOrEqual(1);
    expect(gets).toBeLessThanOrEqual(2);
  });

  it("aborts a multi-chunk parquet read mid-download and leaves cache empty", async () => {
    const store = new InMemoryBlobStore();
    // Synthetic "blob" — large enough to need many chunks. The bytes don't
    // need to be valid parquet because we abort before decode.
    const totalSize = 4096;
    const payload = new Uint8Array(totalSize);
    for (let i = 0; i < totalSize; i += 1) payload[i] = i & 0xff;

    const ref = asBlobRef("abort-mid-download-ref");
    const server = new MockAzureServer({ delayMs: 25 });
    const path = `/container/${ref}`;
    server.preload(path, payload);

    const controller = new AbortController();

    const promise = readParquetFromCache({
      store,
      scope,
      ref,
      signal: controller.signal,
      resolveDownload: () =>
        Promise.resolve({ url: server.urlFor(path), totalSize }),
      download: (opts) =>
        downloadToStore({
          ...opts,
          chunkSize: 256,
          parallelism: 1,
          fetchImpl: server.fetch,
          // Abort once we observe the first chunk hit the cache.
          onProgress: (e: ProgressEvent) => {
            opts.onProgress?.(e);
            if (e.transferred > 0 && !controller.signal.aborted) {
              controller.abort();
            }
          },
        }),
    });

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(await store.has(scope, ref)).toBe(false);
  });

  it("emits multiple progress events during a multi-chunk read with a final transferred === totalSize", async () => {
    const store = new InMemoryBlobStore();
    const built = await buildTable([1, 2, 3, 4, 5, 6], ["a", "b", "c", "d", "e", "f"]);
    const encoded = await encodeParquet(built.table);
    const totalSize = encoded.byteLength;

    const ref = asBlobRef("progress-multichunk-ref");
    // Per-chunk delay > download.ts PROGRESS_THROTTLE_MS (50) so each chunk
    // produces its own progress event rather than being coalesced.
    const server = new MockAzureServer({ delayMs: 60 });
    const path = `/container/${ref}`;
    server.preload(path, encoded);

    // Force ≥4 chunks regardless of encoded size.
    const chunkSize = Math.max(16, Math.floor(totalSize / 4));

    const events: ProgressEvent[] = [];

    const decoded = await readParquetFromCache({
      store,
      scope,
      ref,
      onProgress: (e) => events.push(e),
      resolveDownload: () => Promise.resolve({ url: server.urlFor(path), totalSize }),
      download: chunkedDownload(server.fetch, chunkSize, 1),
    });

    assertColumns(decoded, built.columns);

    expect(events.length).toBeGreaterThanOrEqual(2);
    const last = events.at(-1);
    expect(last).toBeDefined();
    expect(last!.transferred).toBe(totalSize);
    expect(last!.total).toBe(totalSize);

    // Sanity: bytes round-trip through decodeParquet directly too.
    const blob = await store.openRead(scope, ref);
    const fetched = new Uint8Array(await blob.arrayBuffer());
    expect(fetched.byteLength).toBe(totalSize);
    assertColumns(await decodeParquet(fetched), built.columns);
  });
});
