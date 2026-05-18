import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWorkspaces, getWorkspaceThumbnailUrl } from "./workspaces";
import { EvoApiError } from "./errors";
import { parseOrgId, parseWorkspaceId } from "@/types/ids";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

const HUB = "https://us.example.com";
const ORG_ID = parseOrgId("0190e4a8-2222-7000-8000-000000000002");
const WS_ID = parseWorkspaceId("0190e4a8-3333-7000-8000-000000000003");
const TOKEN = "tok-ws";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const sampleUser = {
  id: "0190e4a8-4444-7000-8000-000000000004",
  name: "Alex",
  email: "alex@example.com",
};

const sampleWorkspace = {
  id: WS_ID,
  name: "Mine plan A",
  description: "",
  current_user_role: "owner",
  created_at: "2024-01-01T00:00:00Z",
  created_by: sampleUser,
  updated_at: "2024-01-02T00:00:00Z",
  updated_by: sampleUser,
  labels: [],
  self_link: `${HUB}/workspace/orgs/${ORG_ID}/workspaces/${WS_ID}`,
};

describe("fetchWorkspaces", () => {
  it("returns a Page<Workspace> on success", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        links: {
          count: 1,
          total: 1,
          first: "/x?offset=0",
          last: "/x?offset=0",
          next: null,
          previous: null,
        },
        results: [sampleWorkspace],
      }),
    );

    const page = await fetchWorkspaces(HUB, ORG_ID, TOKEN, {
      limit: 20,
      offset: 0,
      orderBy: "desc:updated_at",
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.name).toBe("Mine plan A");
    expect(page.total).toBe(1);
    expect(page.offset).toBe(0);
    expect(page.limit).toBe(20);
    expect(page.hasMore).toBe(false);

    const call = fetchMock.mock.calls[0]!;
    const url = call[0] as string;
    expect(url).toContain(`${HUB}/workspace/orgs/${ORG_ID}/workspaces?`);
    expect(url).toContain("limit=20");
    expect(url).toContain("order_by=desc%3Aupdated_at");
  });

  it("hasMore is true when more pages remain", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        links: {
          count: 1,
          total: 5,
          first: "/x?offset=0",
          last: "/x?offset=4",
          next: "/x?offset=1",
          previous: null,
        },
        results: [sampleWorkspace],
      }),
    );
    const page = await fetchWorkspaces(HUB, ORG_ID, TOKEN, {
      limit: 1,
      offset: 0,
    });
    expect(page.hasMore).toBe(true);
    expect(page.total).toBe(5);
  });

  it("defaults offset to 0 and limit to 20 when not provided", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        links: { count: 0, total: 0, first: "", last: "", next: null, previous: null },
        results: [],
      }),
    );
    const page = await fetchWorkspaces(HUB, ORG_ID, TOKEN);
    expect(page.offset).toBe(0);
    expect(page.limit).toBe(20);
    expect(page.items).toEqual([]);
  });

  it("throws EvoApiError on non-2xx with structured body", async () => {
    const body = {
      title: "Forbidden",
      detail: "no access",
      status: 403,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(403, body));

    let caught: unknown;
    try {
      await fetchWorkspaces(HUB, ORG_ID, TOKEN);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(EvoApiError);
    const err = caught as EvoApiError;
    expect(err.status).toBe(403);
    expect(err.body).toEqual(body);
    expect(err.method).toBe("GET");
    expect(err.url).toContain(`${HUB}/workspace/orgs/${ORG_ID}/workspaces`);
  });
});

describe("getWorkspaceThumbnailUrl", () => {
  it("composes the thumbnail URL from hub/org/workspace", () => {
    expect(getWorkspaceThumbnailUrl(HUB, ORG_ID, WS_ID)).toBe(
      `${HUB}/workspace/orgs/${ORG_ID}/workspaces/${WS_ID}/thumbnail`,
    );
  });
});
