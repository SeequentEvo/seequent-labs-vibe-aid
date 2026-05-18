import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchDiscovery, resolveInstances } from "./discovery";
import { EvoApiError } from "./errors";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

const ORG_ID = "0190e4a8-1111-7000-8000-000000000001";
const TOKEN = "tok-discovery";

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

const validResponse = {
  discovery: {
    organizations: [{ id: ORG_ID, display_name: "Acme" }],
    hubs: [
      { code: "us-1", display_name: "US Hub", url: "https://us.example.com" },
    ],
    services: [{ code: "evo", display_name: "Evo" }],
    service_access: [
      { hub_code: "us-1", org_id: ORG_ID, services: ["evo"] },
    ],
  },
};

describe("fetchDiscovery", () => {
  it("returns the parsed discovery response on 200", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, validResponse));
    const result = await fetchDiscovery(TOKEN);
    expect(result.discovery.organizations[0]?.display_name).toBe("Acme");

    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe(
      "https://discover.api.seequent.com/evo/identity/v2/discovery?service=evo",
    );
    const headers = (call[1]!.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("throws EvoApiError on a non-2xx response with structured body", async () => {
    const body = { title: "Unauthorized", detail: "bad token", status: 401 };
    fetchMock.mockResolvedValueOnce(jsonResponse(401, body));

    let caught: unknown;
    try {
      await fetchDiscovery(TOKEN);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(EvoApiError);
    const err = caught as EvoApiError;
    expect(err.status).toBe(401);
    expect(err.body).toEqual(body);
    expect(err.method).toBe("GET");
  });
});

describe("resolveInstances", () => {
  it("joins organizations + service_access + hubs into EvoInstance[]", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, validResponse));
    const response = await fetchDiscovery(TOKEN);
    const instances = resolveInstances(response);
    expect(instances).toHaveLength(1);
    expect(instances[0]).toMatchObject({
      id: ORG_ID,
      displayName: "Acme",
      hubUrl: "https://us.example.com",
      hubDisplayName: "US Hub",
    });
  });

  it("filters orgs that have no matching hub", () => {
    const instances = resolveInstances({
      discovery: {
        organizations: [
          {
            id: ORG_ID as unknown as DiscoveryOrgId,
            display_name: "Orphan",
          },
        ],
        hubs: [],
        services: [],
        service_access: [],
      },
    });
    expect(instances).toEqual([]);
  });
});

// Helper local alias just to satisfy the brand without importing from internals.
type DiscoveryOrgId = Parameters<
  typeof resolveInstances
>[0]["discovery"]["organizations"][number]["id"];
