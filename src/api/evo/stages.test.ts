import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EvoApiError } from "./errors";
import { EvoObjectRef } from "./refs/object";
import { EvoWorkspaceRef } from "./refs/workspace";
import { applyStage, listStages, unsetStage } from "./stages";
import { parseStageId, parseVersionId } from "@/types/ids";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

const HUB = "https://hub.example.com";
const ORG_ID = "b208a6c9-6881-4b97-b02d-acb5d81299bb";
const WORKSPACE_ID = "032806a8-dcd7-11ed-8d5c-00155d8f28b5";
const OBJECT_ID = "355fa5a6-f37d-11ed-93c1-00155d19a71b";
const STAGE_ID_1 = "11111111-1111-4111-8111-111111111111";
const STAGE_ID_2 = "22222222-2222-4222-8222-222222222222";
const VERSION = "1706583776404684724";
const TOKEN = "tok-stages";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function noContentResponse(status = 204): Response {
  return new Response(null, { status });
}

let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ws = EvoWorkspaceRef.fromIds({
  hubUrl: HUB,
  orgId: ORG_ID,
  workspaceId: WORKSPACE_ID,
});

const versionedRef = EvoObjectRef.fromIds({
  hubUrl: HUB,
  orgId: ORG_ID,
  workspaceId: WORKSPACE_ID,
  objectId: OBJECT_ID,
  versionId: VERSION,
});

const unversionedRef = EvoObjectRef.fromIds({
  hubUrl: HUB,
  orgId: ORG_ID,
  workspaceId: WORKSPACE_ID,
  objectId: OBJECT_ID,
});

const pathRef = EvoObjectRef.fromPath({
  hubUrl: HUB,
  orgId: ORG_ID,
  workspaceId: WORKSPACE_ID,
  objectPath: "folder/thing",
});

describe("listStages", () => {
  it("returns the unwrapped stages array on 200", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        stages: [
          { stage_id: STAGE_ID_1, name: "Approved" },
          { stage_id: STAGE_ID_2, name: "In Review" },
        ],
      }),
    );

    const stages = await listStages(ws, TOKEN);

    expect(stages).toEqual([
      { stageId: STAGE_ID_1, name: "Approved" },
      { stageId: STAGE_ID_2, name: "In Review" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${HUB}/geoscience-object/orgs/${ORG_ID}/stages`);
    expect(init?.method).toBe("GET");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init?.body).toBeUndefined();
  });

  it("returns an empty array when the org has no stages", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { stages: [] }));
    const stages = await listStages(ws, TOKEN);
    expect(stages).toEqual([]);
  });

  it("throws EvoApiError with the response status on non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { title: "Forbidden", detail: "no access" }),
    );

    let caught: unknown;
    try {
      await listStages(ws, TOKEN);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(EvoApiError);
    expect((caught as EvoApiError).status).toBe(403);
    expect((caught as EvoApiError).method).toBe("GET");
  });
});

describe("applyStage", () => {
  it("PATCHes the metadata endpoint with stage_id and the version query", async () => {
    fetchMock.mockResolvedValueOnce(noContentResponse());

    await applyStage(versionedRef, parseStageId(STAGE_ID_1), TOKEN);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      `${HUB}/geoscience-object/orgs/${ORG_ID}/workspaces/${WORKSPACE_ID}/objects/${OBJECT_ID}/metadata?version_id=${encodeURIComponent(VERSION)}`,
    );
    expect(init?.method).toBe("PATCH");
    const headers = init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init?.body).toBe(JSON.stringify({ stage_id: STAGE_ID_1 }));
  });

  it("omits the version_id query when the ref is unversioned", async () => {
    fetchMock.mockResolvedValueOnce(noContentResponse());

    await applyStage(unversionedRef, parseStageId(STAGE_ID_1), TOKEN);

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      `${HUB}/geoscience-object/orgs/${ORG_ID}/workspaces/${WORKSPACE_ID}/objects/${OBJECT_ID}/metadata`,
    );
  });

  it("returns void on 204", async () => {
    fetchMock.mockResolvedValueOnce(noContentResponse());
    const result = await applyStage(
      versionedRef,
      parseStageId(STAGE_ID_1),
      TOKEN,
    );
    expect(result).toBeUndefined();
  });

  it("throws EvoApiError on non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { title: "Conflict", detail: "version mismatch" }),
    );

    let caught: unknown;
    try {
      await applyStage(versionedRef, parseStageId(STAGE_ID_1), TOKEN);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(EvoApiError);
    expect((caught as EvoApiError).status).toBe(409);
    expect((caught as EvoApiError).method).toBe("PATCH");
  });

  it("rejects path-addressed object refs without calling fetch", async () => {
    await expect(
      applyStage(pathRef, parseStageId(STAGE_ID_1), TOKEN),
    ).rejects.toThrow(/path-addressed/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("unsetStage", () => {
  it("PATCHes the metadata endpoint with stage_id null and the version query", async () => {
    fetchMock.mockResolvedValueOnce(noContentResponse());

    await unsetStage(versionedRef.withVersion(VERSION), TOKEN);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      `${HUB}/geoscience-object/orgs/${ORG_ID}/workspaces/${WORKSPACE_ID}/objects/${OBJECT_ID}/metadata?version_id=${encodeURIComponent(VERSION)}`,
    );
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe(JSON.stringify({ stage_id: null }));
  });

  it("returns void on 204", async () => {
    fetchMock.mockResolvedValueOnce(noContentResponse());
    const result = await unsetStage(versionedRef, TOKEN);
    expect(result).toBeUndefined();
  });

  it("throws EvoApiError on non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { title: "Not Found", detail: "no such object" }),
    );
    let caught: unknown;
    try {
      await unsetStage(versionedRef, TOKEN);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(EvoApiError);
    expect((caught as EvoApiError).status).toBe(404);
  });

  it("rejects path-addressed object refs without calling fetch", async () => {
    await expect(unsetStage(pathRef, TOKEN)).rejects.toThrow(/path-addressed/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a fresh versioned ref built via parseVersionId", async () => {
    fetchMock.mockResolvedValueOnce(noContentResponse());
    const ref = unversionedRef.withVersion(parseVersionId(VERSION));
    await unsetStage(ref, TOKEN);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain(`version_id=${encodeURIComponent(VERSION)}`);
  });
});
