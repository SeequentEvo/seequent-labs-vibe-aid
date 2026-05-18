import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BATCH_VERSION_CHECK_MAX,
  DATA_UPLOAD_NAMES_MAX,
  batchCheckLatestObjectVersions,
  createObject,
  deleteObject,
  extractObjectDataDownloadUrls,
  fetchObject,
  listObjects,
  requestObjectDataUploadUrls,
  restoreObject,
  updateObject,
} from "./objects";
import { EvoApiError } from "./errors";
import { EvoObjectRef } from "./refs/object";
import { EvoWorkspaceRef } from "./refs/workspace";
import { parseObjectId } from "@/types/ids";
import type { GeoscienceObjectEnvelope } from "@/types/object";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HUB = "https://au1.evo.seequent.com";
const ORG_ID = "3e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7";
const WS_ID = "5a6b7c8d-9e0f-4a1b-b2c3-d4e5f6a7b8c9";
const OBJ_ID = "9e0f1a2b-3c4d-4e5f-b6a7-b8c9d0e1f2a3";
const OBJ_ID_2 = "1c2d3e4f-5a6b-4c7d-8e9f-a0b1c2d3e4f5";
const USER_ID = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";
const VERSION_ID = "2024-01-15T10:30:00.000Z";
const TOKEN = "tok-abc";

const ws = EvoWorkspaceRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID });
const objRefById = EvoObjectRef.fromIds({
  hubUrl: HUB,
  orgId: ORG_ID,
  workspaceId: WS_ID,
  objectId: OBJ_ID,
});
const objRefByPath = EvoObjectRef.fromPath({
  hubUrl: HUB,
  orgId: ORG_ID,
  workspaceId: WS_ID,
  objectPath: "surfaces/topography",
});

const WS_OBJECTS_BASE = `${HUB}/geoscience-object/orgs/${ORG_ID}/workspaces/${WS_ID}`;

const userPayload = { id: USER_ID, name: "Ada", email: "ada@example.com" };

function summaryFixture(objectId: string, name = "topography.json") {
  return {
    object_id: objectId,
    name,
    path: `/surfaces/`,
    schema: "/objects/pointset/2.0.0/pointset.schema.json",
    version_id: VERSION_ID,
    etag: "etag-123",
    created_at: "2024-01-01T00:00:00Z",
    created_by: userPayload,
    modified_at: "2024-01-02T00:00:00Z",
    modified_by: userPayload,
    deleted_at: null,
    deleted_by: null,
    stage: null,
    geojson_bounding_box_from_workspace_crs: false,
    links: { download: "https://signed/download" },
  };
}

function envelopeFixture(): unknown {
  return {
    object_id: OBJ_ID,
    object_path: "surfaces/topography",
    version_id: VERSION_ID,
    etag: "etag-123",
    created_at: "2024-01-01T00:00:00Z",
    created_by: userPayload,
    modified_at: "2024-01-02T00:00:00Z",
    modified_by: userPayload,
    deleted_at: null,
    deleted_by: null,
    stage: null,
    object: { schema: "/objects/pointset/2.0.0/pointset.schema.json", uuid: OBJ_ID },
    links: {
      download: "https://signed/object",
      data: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "abc123",
          download_url: "https://signed/abc123",
        },
      ],
    },
    versions: null,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;
let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastCall(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1)!;
  return { url: call[0] as string, init: call[1] as RequestInit };
}

function lastHeaders(): Record<string, string> {
  return lastCall().init.headers as Record<string, string>;
}

// ---------------------------------------------------------------------------
// listObjects
// ---------------------------------------------------------------------------

describe("listObjects", () => {
  it("happy path: builds workspace URL, applies filters, returns Page<T>", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        objects: [summaryFixture(OBJ_ID), summaryFixture(OBJ_ID_2, "second.json")],
        offset: 0,
        limit: 10,
        count: 2,
        total: 5,
        links: { next: "...", prev: null },
      }),
    );

    const page = await listObjects(ws, TOKEN, {
      limit: 10,
      offset: 0,
      deleted: false,
      orderBy: "object_name,desc:created_at",
      schemaId: ["/objects/pointset/2.0.0/pointset.schema.json"],
      objectName: ["topography"],
      createdBy: [USER_ID],
    });

    expect(page.items).toHaveLength(2);
    expect(page.items[0]!.objectId).toBe(OBJ_ID);
    expect(page.total).toBe(5);
    expect(page.offset).toBe(0);
    expect(page.limit).toBe(10);
    expect(page.hasMore).toBe(true);

    const { url, init } = lastCall();
    expect(url.startsWith(`${WS_OBJECTS_BASE}/objects?`)).toBe(true);
    expect(url).toContain("limit=10");
    expect(url).toContain("offset=0");
    expect(url).toContain("deleted=false");
    expect(url).toContain("order_by=object_name%2Cdesc%3Acreated_at");
    expect(url).toContain("schema_id=");
    expect(url).toContain(`created_by=${USER_ID}`);
    expect(init.method).toBe("GET");
    expect(lastHeaders().Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("error path: non-2xx → throws EvoApiError with status", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { title: "Forbidden" }));
    await expect(listObjects(ws, TOKEN)).rejects.toMatchObject({
      name: "EvoApiError",
      status: 403,
    });
  });
});

// ---------------------------------------------------------------------------
// fetchObject
// ---------------------------------------------------------------------------

describe("fetchObject", () => {
  it("UUID ref: GET ref.toUrl(), parses envelope", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, envelopeFixture()));
    const env = await fetchObject(objRefById, TOKEN);

    expect(env.objectId).toBe(OBJ_ID);
    expect(env.versionId).toBe(VERSION_ID);
    expect(env.schema).toBe("/objects/pointset/2.0.0/pointset.schema.json");
    expect(env.links.data).toHaveLength(1);

    const { url, init } = lastCall();
    expect(url).toBe(`${WS_OBJECTS_BASE}/objects/${OBJ_ID}`);
    expect(init.method).toBe("GET");
  });

  it("path ref: appends .json suffix to wire path", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, envelopeFixture()));
    await fetchObject(objRefByPath, TOKEN, { includeVersions: true });

    const { url } = lastCall();
    expect(url).toBe(
      `${WS_OBJECTS_BASE}/objects/path/surfaces/topography.json?include_versions=true`,
    );
  });

  it("error path: 404 → throws EvoApiError", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { title: "Not Found" }));
    await expect(fetchObject(objRefById, TOKEN)).rejects.toBeInstanceOf(EvoApiError);
  });
});

// ---------------------------------------------------------------------------
// createObject
// ---------------------------------------------------------------------------

describe("createObject", () => {
  it("POST to /objects/path/{path}.json, sends body.object as JSON", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, envelopeFixture()));
    const body = {
      schema: "/objects/pointset/2.0.0/pointset.schema.json",
      uuid: null,
      name: "topography",
    };
    const env = await createObject(ws, { path: "surfaces/topography", object: body }, TOKEN);

    expect(env.objectId).toBe(OBJ_ID);
    const { url, init } = lastCall();
    expect(url).toBe(`${WS_OBJECTS_BASE}/objects/path/surfaces/topography.json`);
    expect(init.method).toBe("POST");
    // Small body: gzip flag is set but body is below threshold, so plain JSON.
    expect(init.body).toBe(JSON.stringify(body));
    expect(lastHeaders()["Content-Type"]).toBe("application/json");
  });

  it("sends Content-Encoding: gzip for large bodies", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, envelopeFixture()));
    const largeObject = { data: "x".repeat(2000), schema: "s", uuid: null };
    await createObject(ws, { path: "surfaces/big", object: largeObject }, TOKEN);

    const headers = lastHeaders();
    expect(headers["Content-Encoding"]).toBe("gzip");
    expect(lastCall().init.body).toBeInstanceOf(Uint8Array);
  });

  it("error path: 400 → throws EvoApiError", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { title: "Bad" }));
    await expect(
      createObject(ws, { path: "x", object: {} }, TOKEN),
    ).rejects.toMatchObject({ name: "EvoApiError", status: 400 });
  });
});

// ---------------------------------------------------------------------------
// updateObject
// ---------------------------------------------------------------------------

describe("updateObject", () => {
  it("POST to UUID URL with body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, envelopeFixture()));
    const body = { schema: "x", uuid: OBJ_ID };
    await updateObject(objRefById, body, TOKEN);

    const { url, init } = lastCall();
    expect(url).toBe(`${WS_OBJECTS_BASE}/objects/${OBJ_ID}`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify(body));
  });

  it("error path: 409 → throws EvoApiError", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { title: "Conflict" }));
    await expect(updateObject(objRefById, {}, TOKEN)).rejects.toMatchObject({
      name: "EvoApiError",
      status: 409,
    });
  });
});

// ---------------------------------------------------------------------------
// deleteObject
// ---------------------------------------------------------------------------

describe("deleteObject", () => {
  it("DELETE to ref URL, returns void on 204", async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(204));
    await expect(deleteObject(objRefById, TOKEN)).resolves.toBeUndefined();

    const { url, init } = lastCall();
    expect(url).toBe(`${WS_OBJECTS_BASE}/objects/${OBJ_ID}`);
    expect(init.method).toBe("DELETE");
  });

  it("DELETE by path appends .json", async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(204));
    await deleteObject(objRefByPath, TOKEN);
    expect(lastCall().url).toBe(
      `${WS_OBJECTS_BASE}/objects/path/surfaces/topography.json`,
    );
  });

  it("error path: 404 → throws EvoApiError", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { title: "Not Found" }));
    await expect(deleteObject(objRefById, TOKEN)).rejects.toMatchObject({
      name: "EvoApiError",
      status: 404,
    });
  });
});

// ---------------------------------------------------------------------------
// restoreObject
// ---------------------------------------------------------------------------

describe("restoreObject", () => {
  it("POST {id}?deleted=false with empty body, returns void", async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(204));
    await expect(restoreObject(objRefById, TOKEN)).resolves.toBeUndefined();

    const { url, init } = lastCall();
    expect(url).toBe(`${WS_OBJECTS_BASE}/objects/${OBJ_ID}?deleted=false`);
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(lastHeaders()["Content-Type"]).toBeUndefined();
  });

  it("throws when called with a path-based ref", async () => {
    await expect(restoreObject(objRefByPath, TOKEN)).rejects.toThrow(/UUID-addressed/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("error path: 404 → throws EvoApiError", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { title: "Not Found" }));
    await expect(restoreObject(objRefById, TOKEN)).rejects.toBeInstanceOf(EvoApiError);
  });
});

// ---------------------------------------------------------------------------
// batchCheckLatestObjectVersions
// ---------------------------------------------------------------------------

describe("batchCheckLatestObjectVersions", () => {
  it("PATCH /objects with bare-array body, maps response to camelCase", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, [
        { object_id: OBJ_ID, version_id: VERSION_ID },
        { object_id: OBJ_ID_2, version_id: null },
      ]),
    );

    const ids = [parseObjectId(OBJ_ID), parseObjectId(OBJ_ID_2)];
    const out = await batchCheckLatestObjectVersions(ws, ids, TOKEN);

    expect(out).toEqual([
      { objectId: OBJ_ID, versionId: VERSION_ID },
      { objectId: OBJ_ID_2, versionId: null },
    ]);

    const { url, init } = lastCall();
    expect(url).toBe(`${WS_OBJECTS_BASE}/objects`);
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify(ids));
  });

  it("throws when ids exceeds the per-request limit", async () => {
    const ids = Array.from({ length: BATCH_VERSION_CHECK_MAX + 1 }, () =>
      parseObjectId(OBJ_ID),
    );
    await expect(batchCheckLatestObjectVersions(ws, ids, TOKEN)).rejects.toThrow(
      /at most 500/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on empty input (no-op request would waste a round trip)", async () => {
    await expect(batchCheckLatestObjectVersions(ws, [], TOKEN)).rejects.toThrow(
      /at least one/,
    );
  });

  it("error path: 400 → throws EvoApiError", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { title: "Bad" }));
    await expect(
      batchCheckLatestObjectVersions(ws, [parseObjectId(OBJ_ID)], TOKEN),
    ).rejects.toMatchObject({ name: "EvoApiError", status: 400 });
  });
});

// ---------------------------------------------------------------------------
// requestObjectDataUploadUrls
// ---------------------------------------------------------------------------

describe("requestObjectDataUploadUrls", () => {
  const SHA = "a".repeat(64);
  const SHA_B = "b".repeat(64);

  it("PUT /data with [{name},...] body, returns per-entry results", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, [
        { id: "11111111-1111-4111-8111-111111111111", name: SHA, exists: false, upload_url: "https://signed/upload" },
        { id: "22222222-2222-4222-8222-222222222222", name: SHA_B, exists: true, upload_url: null },
      ]),
    );

    const out = await requestObjectDataUploadUrls(ws, [SHA, SHA_B], TOKEN);
    expect(out).toEqual([
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: SHA,
        exists: false,
        uploadUrl: "https://signed/upload",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: SHA_B,
        exists: true,
      },
    ]);

    const { url, init } = lastCall();
    expect(url).toBe(`${WS_OBJECTS_BASE}/data`);
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(JSON.stringify([{ name: SHA }, { name: SHA_B }]));
  });

  it("throws when names exceeds the per-request limit", async () => {
    const names = Array.from({ length: DATA_UPLOAD_NAMES_MAX + 1 }, () => SHA);
    await expect(requestObjectDataUploadUrls(ws, names, TOKEN)).rejects.toThrow(
      /at most 32/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on empty input", async () => {
    await expect(requestObjectDataUploadUrls(ws, [], TOKEN)).rejects.toThrow(
      /at least one/,
    );
  });

  it("error path: 502 → throws EvoApiError", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(502, { title: "Upstream" }));
    await expect(
      requestObjectDataUploadUrls(ws, [SHA], TOKEN),
    ).rejects.toMatchObject({ name: "EvoApiError", status: 502 });
  });
});

// ---------------------------------------------------------------------------
// extractObjectDataDownloadUrls
// ---------------------------------------------------------------------------

describe("extractObjectDataDownloadUrls", () => {
  it("keys by name when present; falls back to id when name is empty", () => {
    const envelope: GeoscienceObjectEnvelope = {
      objectId: parseObjectId(OBJ_ID),
      path: null,
      schema: "x",
      versionId: VERSION_ID as never,
      etag: "e",
      createdAt: "",
      createdBy: null,
      modifiedAt: "",
      modifiedBy: null,
      deletedAt: null,
      deletedBy: null,
      stage: null,
      object: null,
      links: {
        data: [
          { id: "id-1", name: "sha-aaa", downloadUrl: "https://signed/aaa" },
          { id: "id-2", name: "", downloadUrl: "https://signed/bbb" },
          { id: "id-3", name: "sha-ccc", downloadUrl: null },
          { id: "id-4", name: "sha-ddd", downloadUrl: "https://signed/ddd" },
        ],
      },
    };

    const map = extractObjectDataDownloadUrls(envelope);
    expect(map.size).toBe(3);
    expect(map.get("sha-aaa")).toBe("https://signed/aaa");
    expect(map.get("id-2")).toBe("https://signed/bbb");
    expect(map.get("sha-ccc")).toBeUndefined(); // null URL skipped
    expect(map.get("sha-ddd")).toBe("https://signed/ddd");
  });

  it("returns an empty map when links.data is absent", () => {
    const envelope: GeoscienceObjectEnvelope = {
      objectId: parseObjectId(OBJ_ID),
      path: null,
      schema: "x",
      versionId: VERSION_ID as never,
      etag: "e",
      createdAt: "",
      createdBy: null,
      modifiedAt: "",
      modifiedBy: null,
      deletedAt: null,
      deletedBy: null,
      stage: null,
      object: null,
      links: {},
    };
    expect(extractObjectDataDownloadUrls(envelope).size).toBe(0);
  });
});
