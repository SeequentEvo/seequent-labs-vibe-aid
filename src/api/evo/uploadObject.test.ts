import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BlobRef, BlobStore, CacheScope } from "@/api/evo/blob";
import { asBlobRef } from "@/api/evo/blob";
import { writeParquetToCache } from "@/api/evo/blob/parquetService";
import { uploadFromStore } from "@/api/evo/blob/upload";
import {
  createObject,
  requestObjectDataUploadUrls,
  updateObject,
} from "./objects";
import { EvoWorkspaceRef } from "@/api/evo/refs/workspace";
import type { GeoscienceObjectEnvelope } from "@/types/object";
import type { ObjectId, ObjectPath, VersionId } from "@/types/ids";
import type { TaggedTable, UploadProgress } from "./uploadObject";
import { uploadObjectWithData } from "./uploadObject";

vi.mock("@/api/evo/blob/parquetService", () => ({
  writeParquetToCache: vi.fn(),
}));
vi.mock("@/api/evo/objects", async (importOriginal) => {
  const orig =
    await importOriginal<typeof import("@/api/evo/objects")>();
  return {
    ...orig,
    requestObjectDataUploadUrls: vi.fn(),
    createObject: vi.fn(),
    updateObject: vi.fn(),
  };
});
vi.mock("@/api/evo/blob/upload", () => ({
  uploadFromStore: vi.fn(),
}));

const HUB = "https://au1.evo.seequent.com";
const ORG_ID = "3e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7";
const WS_ID = "5a6b7c8d-9e0f-4a1b-b2c3-d4e5f6a7b8c9";
const TOKEN = "test-access-token";

const ws = EvoWorkspaceRef.fromIds({
  hubUrl: HUB,
  orgId: ORG_ID,
  workspaceId: WS_ID,
});

const HASH_A =
  "a".repeat(64) as string;
const HASH_B =
  "b".repeat(64) as string;

const REF_A = asBlobRef(HASH_A);
const REF_B = asBlobRef(HASH_B);

const mockStore = {} as BlobStore;
const mockScope = {
  orgId: ORG_ID,
  workspaceId: WS_ID,
  kind: "geoscience-object",
} as CacheScope;

const mockTable = {} as TaggedTable["table"];

function makeMockEnvelope(): GeoscienceObjectEnvelope {
  return {
    objectId: "11111111-1111-1111-1111-111111111111" as ObjectId,
    path: "/test/object" as ObjectPath,
    schema: "test-schema/1.0",
    versionId: "v1" as VersionId,
    etag: "etag-1",
    createdAt: "2024-01-01T00:00:00Z",
    createdBy: null,
    modifiedAt: "2024-01-01T00:00:00Z",
    modifiedBy: null,
    deletedAt: null,
    deletedBy: null,
    stage: null,
    object: {},
    links: {},
  };
}

/**
 * Build a body that embeds blob refs in the format extractBlobRefs expects:
 * plain objects with `data` (sha-256) and `data_type` sibling.
 */
function buildBodyFromRefs(
  tagToRef: ReadonlyMap<string, BlobRef>,
): unknown {
  const attributes: unknown[] = [];
  for (const [, ref] of tagToRef) {
    attributes.push({ data: ref, data_type: "Float64" });
  }
  return { uuid: null, attributes };
}

const mockedWriteParquet = vi.mocked(writeParquetToCache);
const mockedRequestUrls = vi.mocked(requestObjectDataUploadUrls);
const mockedUpload = vi.mocked(uploadFromStore);
const mockedCreate = vi.mocked(createObject);
const mockedUpdate = vi.mocked(updateObject);

beforeEach(() => {
  mockedWriteParquet.mockReset();
  mockedRequestUrls.mockReset();
  mockedUpload.mockReset();
  mockedCreate.mockReset();
  mockedUpdate.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("uploadObjectWithData", () => {
  it("happy path: uploads only missing blobs and creates object", async () => {
    mockedWriteParquet
      .mockResolvedValueOnce({ ref: REF_A, bytes: 1000 })
      .mockResolvedValueOnce({ ref: REF_B, bytes: 2000 });

    mockedRequestUrls.mockResolvedValueOnce([
      { id: "00000000-0000-0000-0000-000000000001", name: HASH_A, exists: true },
      { id: "00000000-0000-0000-0000-000000000002", name: HASH_B, exists: false, uploadUrl: "https://upload.test/b" },
    ]);

    mockedUpload.mockResolvedValueOnce(undefined);

    const envelope = makeMockEnvelope();
    mockedCreate.mockResolvedValueOnce(envelope);

    const result = await uploadObjectWithData(
      {
        ws,
        objectPath: "/test/object",
        blobs: [
          { tag: "vertices", table: mockTable },
          { tag: "triangles", table: mockTable },
        ],
        buildBody: buildBodyFromRefs,
        store: mockStore,
        scope: mockScope,
      },
      TOKEN,
    );

    expect(mockedWriteParquet).toHaveBeenCalledTimes(2);
    expect(mockedRequestUrls).toHaveBeenCalledWith(
      ws,
      expect.arrayContaining([HASH_A, HASH_B]),
      TOKEN,
    );
    expect(mockedUpload).toHaveBeenCalledTimes(1);
    expect(mockedUpload).toHaveBeenCalledWith(
      expect.objectContaining({ ref: REF_B, uploadUrl: "https://upload.test/b" }),
    );
    expect(mockedCreate).toHaveBeenCalledTimes(1);
    expect(result).toBe(envelope);
  });

  it("skips upload when all blobs already exist", async () => {
    mockedWriteParquet
      .mockResolvedValueOnce({ ref: REF_A, bytes: 1000 })
      .mockResolvedValueOnce({ ref: REF_B, bytes: 2000 });

    mockedRequestUrls.mockResolvedValueOnce([
      { id: "00000000-0000-0000-0000-000000000001", name: HASH_A, exists: true },
      { id: "00000000-0000-0000-0000-000000000002", name: HASH_B, exists: true },
    ]);

    const envelope = makeMockEnvelope();
    mockedCreate.mockResolvedValueOnce(envelope);

    await uploadObjectWithData(
      {
        ws,
        objectPath: "/test/object",
        blobs: [
          { tag: "a", table: mockTable },
          { tag: "b", table: mockTable },
        ],
        buildBody: buildBodyFromRefs,
        store: mockStore,
        scope: mockScope,
      },
      TOKEN,
    );

    expect(mockedUpload).not.toHaveBeenCalled();
    expect(mockedCreate).toHaveBeenCalledTimes(1);
  });

  it("throws when body has an unreferenced staged blob", async () => {
    mockedWriteParquet
      .mockResolvedValueOnce({ ref: REF_A, bytes: 1000 })
      .mockResolvedValueOnce({ ref: REF_B, bytes: 2000 });

    // buildBody that only references REF_A, leaving REF_B unreferenced
    const partialBuilder = () => ({
      uuid: null,
      attributes: [{ data: HASH_A, data_type: "Float64" }],
    });

    await expect(
      uploadObjectWithData(
        {
          ws,
          objectPath: "/test/object",
          blobs: [
            { tag: "a", table: mockTable },
            { tag: "b", table: mockTable },
          ],
          buildBody: partialBuilder,
          store: mockStore,
          scope: mockScope,
        },
        TOKEN,
      ),
    ).rejects.toThrow(/not referenced by the body/);
  });

  it("throws when body references an unstaged blob", async () => {
    mockedWriteParquet.mockResolvedValueOnce({ ref: REF_A, bytes: 1000 });

    // buildBody that references a hash that was never staged
    const extraRefBuilder = () => ({
      uuid: null,
      attributes: [
        { data: HASH_A, data_type: "Float64" },
        { data: HASH_B, data_type: "Float64" },
      ],
    });

    await expect(
      uploadObjectWithData(
        {
          ws,
          objectPath: "/test/object",
          blobs: [{ tag: "a", table: mockTable }],
          buildBody: extraRefBuilder,
          store: mockStore,
          scope: mockScope,
        },
        TOKEN,
      ),
    ).rejects.toThrow(/was not staged/);
  });

  it("propagates createObject failure", async () => {
    mockedWriteParquet.mockResolvedValueOnce({ ref: REF_A, bytes: 1000 });

    mockedRequestUrls.mockResolvedValueOnce([
      { id: "00000000-0000-0000-0000-000000000001", name: HASH_A, exists: true },
    ]);

    mockedCreate.mockRejectedValueOnce(new Error("POST failed"));

    // buildBody that references only REF_A
    await expect(
      uploadObjectWithData(
        {
          ws,
          objectPath: "/test/object",
          blobs: [{ tag: "a", table: mockTable }],
          buildBody: () => ({
            uuid: null,
            attributes: [{ data: HASH_A, data_type: "Float64" }],
          }),
          store: mockStore,
          scope: mockScope,
        },
        TOKEN,
      ),
    ).rejects.toThrow("POST failed");
  });

  it("batches upload URL requests for >32 blobs", async () => {
    const blobCount = 35;
    const blobs: TaggedTable[] = [];
    const refs: BlobRef[] = [];

    for (let i = 0; i < blobCount; i++) {
      const hex = i.toString(16).padStart(64, "0");
      const ref = asBlobRef(hex);
      refs.push(ref);
      blobs.push({ tag: `tag-${String(i)}`, table: mockTable });
      mockedWriteParquet.mockResolvedValueOnce({ ref, bytes: 100 });
    }

    // First batch: 32, second batch: 3
    mockedRequestUrls
      .mockResolvedValueOnce(
        refs.slice(0, 32).map((r, i) => ({
          id: `00000000-0000-0000-0000-${(i + 1).toString().padStart(12, "0")}`,
          name: r as string,
          exists: true,
        })),
      )
      .mockResolvedValueOnce(
        refs.slice(32).map((r, i) => ({
          id: `00000000-0000-0000-0000-${(i + 33).toString().padStart(12, "0")}`,
          name: r as string,
          exists: true,
        })),
      );

    const envelope = makeMockEnvelope();
    mockedCreate.mockResolvedValueOnce(envelope);

    const builder = (tagToRef: ReadonlyMap<string, BlobRef>) => {
      const attributes = [...tagToRef.values()].map((ref) => ({
        data: ref,
        data_type: "Float64",
      }));
      return { uuid: null, attributes };
    };

    await uploadObjectWithData(
      {
        ws,
        objectPath: "/test/object",
        blobs,
        buildBody: builder,
        store: mockStore,
        scope: mockScope,
      },
      TOKEN,
    );

    expect(mockedRequestUrls).toHaveBeenCalledTimes(2);
    const firstCallNames = mockedRequestUrls.mock.calls[0]![1] as string[];
    const secondCallNames = mockedRequestUrls.mock.calls[1]![1] as string[];
    expect(firstCallNames).toHaveLength(32);
    expect(secondCallNames).toHaveLength(3);
  });

  it("reports progress through all phases in order", async () => {
    mockedWriteParquet.mockResolvedValueOnce({ ref: REF_A, bytes: 500 });

    mockedRequestUrls.mockResolvedValueOnce([
      { id: "00000000-0000-0000-0000-000000000001", name: HASH_A, exists: false, uploadUrl: "https://upload.test/a" },
    ]);

    mockedUpload.mockResolvedValueOnce(undefined);

    const envelope = makeMockEnvelope();
    mockedCreate.mockResolvedValueOnce(envelope);

    const phases: string[] = [];
    const onProgress = (p: UploadProgress) => {
      phases.push(p.phase);
    };

    await uploadObjectWithData(
      {
        ws,
        objectPath: "/test/object",
        blobs: [{ tag: "a", table: mockTable }],
        buildBody: () => ({
          uuid: null,
          attributes: [{ data: HASH_A, data_type: "Float64" }],
        }),
        store: mockStore,
        scope: mockScope,
        onProgress,
      },
      TOKEN,
    );

    expect(phases).toEqual([
      "staging-blobs", // initial 0/1
      "staging-blobs", // 1/1
      "building-body",
      "requesting-upload-urls",
      "uploading-blobs", // initial 0/total
      "creating-object",
    ]);
  });

  it("calls updateObject (not createObject) when existingObjectId is set, with body uuid set", async () => {
    mockedWriteParquet.mockResolvedValueOnce({ ref: REF_A, bytes: 1000 });
    mockedRequestUrls.mockResolvedValueOnce([{ id: "00000000-0000-0000-0000-000000000001", name: HASH_A, exists: true }]);

    const envelope = makeMockEnvelope();
    mockedUpdate.mockResolvedValueOnce(envelope);

    const EXISTING = "22222222-2222-4222-9222-222222222222";

    const result = await uploadObjectWithData(
      {
        ws,
        objectPath: "/test/object",
        existingObjectId: EXISTING,
        blobs: [{ tag: "vertices", table: mockTable }],
        buildBody: buildBodyFromRefs,
        store: mockStore,
        scope: mockScope,
      },
      TOKEN,
    );

    expect(mockedCreate).not.toHaveBeenCalled();
    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    const [refArg, bodyArg] = mockedUpdate.mock.calls[0]!;
    expect(refArg.objectId).toBe(EXISTING);
    expect((bodyArg as { uuid: string }).uuid).toBe(EXISTING);
    expect(result).toBe(envelope);
  });
});
