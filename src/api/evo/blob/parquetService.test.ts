// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { tableFromIPC } from "apache-arrow";

import { parseOrgId, parseWorkspaceId } from "@/types/ids";
import { buildParquetTable } from "./__tests__/buildParquetTable";
import { InMemoryBlobStore } from "./inMemoryBlobStore";
import {
  decodeParquet,
  encodeParquet,
  sha256Hex,
  type Table,
} from "./parquetCodec";

const toAB = (src: Uint8Array): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(src.byteLength));
  out.set(src);
  return out;
};
import {
  readParquetFromCache,
  writeParquetToCache,
  type DownloadFn,
} from "./parquetService";
import {
  asBlobRef,
  BlobStoreQuotaError,
  type CacheScope,
} from "./types";

const orgId = parseOrgId("11111111-1111-4111-8111-111111111111");
const workspaceId = parseWorkspaceId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
const scope: CacheScope = { orgId, workspaceId, kind: "geoscience-object" };

async function buildTable(): Promise<Table> {
  return buildParquetTable({
    ids: Int32Array.from([10, 20, 30]),
    names: ["x", "y", "z"],
  });
}

const assertColumns = (table: Table): void => {
  const arrowTable = tableFromIPC(table.intoIPCStream());
  expect(arrowTable.schema.fields.map((f) => f.name)).toEqual(["id", "name"]);
  expect(arrowTable.numRows).toBe(3);
  const idChild = arrowTable.getChild("id");
  const nameChild = arrowTable.getChild("name");
  expect(idChild).not.toBeNull();
  expect(nameChild).not.toBeNull();
  expect(Array.from(idChild!.toArray() as Int32Array)).toEqual([10, 20, 30]);
  expect(Array.from(nameChild!.toArray() as string[])).toEqual(["x", "y", "z"]);
};

describe("parquetService", () => {
  it("returns the cached table on a cache hit without invoking resolveDownload", async () => {
    const store = new InMemoryBlobStore();
    const table = await buildTable();
    const bytes = toAB(await encodeParquet(table));
    const ref = asBlobRef(await sha256Hex(bytes));
    await store.put(scope, ref, bytes);

    const resolveDownload = vi.fn();
    const download: DownloadFn = vi.fn();

    const result = await readParquetFromCache({
      store,
      scope,
      ref,
      resolveDownload,
      download,
    });

    expect(resolveDownload).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
    assertColumns(result);
  });

  it("downloads, caches, and decodes on a cache miss", async () => {
    const store = new InMemoryBlobStore();
    const table = await buildTable();
    const bytes = toAB(await encodeParquet(table));
    const ref = asBlobRef(await sha256Hex(bytes));

    const resolveDownload = vi.fn(async () =>
      Promise.resolve({ url: "https://example.test/blob", totalSize: bytes.byteLength }),
    );
    const download: DownloadFn = vi.fn(async (opts) => {
      await opts.store.put(opts.scope, opts.ref, bytes);
      opts.onProgress?.({ transferred: bytes.byteLength, total: bytes.byteLength });
    });

    const progress: number[] = [];
    const result = await readParquetFromCache({
      store,
      scope,
      ref,
      resolveDownload,
      download,
      onProgress: (e) => progress.push(e.transferred),
    });

    expect(resolveDownload).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledTimes(1);
    expect(progress.at(-1)).toBe(bytes.byteLength);
    assertColumns(result);
    expect(await store.has(scope, ref)).toBe(true);
  });

  it("propagates AbortError from the downloader and leaves cache empty", async () => {
    const store = new InMemoryBlobStore();
    const ref = asBlobRef("a".repeat(64));
    const controller = new AbortController();
    controller.abort();

    const download: DownloadFn = vi.fn(async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    });

    await expect(
      readParquetFromCache({
        store,
        scope,
        ref,
        resolveDownload: () =>
          Promise.resolve({ url: "https://example.test/blob", totalSize: 16 }),
        download,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(await store.has(scope, ref)).toBe(false);
  });

  it("write round-trip: writeParquetToCache → readParquetFromCache hits cache", async () => {
    const store = new InMemoryBlobStore();
    const table = await buildTable();

    const { ref, bytes } = await writeParquetToCache({ store, scope, table });
    expect(bytes).toBeGreaterThan(0);
    expect(await store.has(scope, ref)).toBe(true);

    const resolveDownload = vi.fn();
    const decoded = await readParquetFromCache({
      store,
      scope,
      ref,
      resolveDownload,
    });
    expect(resolveDownload).not.toHaveBeenCalled();
    assertColumns(decoded);
  });

  it("writeParquetToCache returns the SHA-256 hex digest as the ref", async () => {
    const store = new InMemoryBlobStore();
    const table = await buildTable();
    const { ref, bytes } = await writeParquetToCache({ store, scope, table });

    expect(ref).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(ref)).toBe(true);

    const blob = await store.openRead(scope, ref);
    const buf = new Uint8Array(await blob.arrayBuffer());
    expect(buf.byteLength).toBe(bytes);
    expect(await sha256Hex(toAB(buf))).toBe(ref);

    // The cached bytes round-trip through decodeParquet.
    assertColumns(await decodeParquet(buf));
  });

  it("propagates BlobStoreQuotaError when the encoded blob exceeds budget", async () => {
    const store = new InMemoryBlobStore({ budgetBytes: 16 });
    const table = await buildTable();

    await expect(
      writeParquetToCache({ store, scope, table }),
    ).rejects.toBeInstanceOf(BlobStoreQuotaError);
  });
});
