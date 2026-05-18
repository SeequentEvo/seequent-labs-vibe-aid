/**
 * Evo Discovery API client.
 *
 * The Discovery API is the global entrypoint to the Evo platform.
 * It resolves which instances the user has access to and the API
 * base URL for each instance.
 */

import { z } from "zod";

import type { DiscoveryResponse, EvoInstance } from "@/types/evo";
import { orgIdSchema, parseHubCode } from "@/types/ids";
import { assertOk, evoFetch } from "./fetch";

// ---------------------------------------------------------------------------
// Zod schema — validates shape + brands UUID/opaque IDs
// ---------------------------------------------------------------------------

const discoveryOrganizationSchema = z.object({
  id: orgIdSchema,
  display_name: z.string(),
});

const discoveryHubSchema = z.object({
  code: z.string(),
  display_name: z.string(),
  url: z.string(),
});

const discoveryServiceSchema = z.object({
  code: z.string(),
  display_name: z.string(),
});

const discoveryServiceAccessSchema = z.object({
  hub_code: z.string(),
  org_id: orgIdSchema,
  services: z.array(z.string()),
});

const discoveryResponseSchema = z.object({
  discovery: z.object({
    organizations: z.array(discoveryOrganizationSchema),
    hubs: z.array(discoveryHubSchema),
    services: z.array(discoveryServiceSchema),
    service_access: z.array(discoveryServiceAccessSchema),
  }),
});

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const DISCOVERY_PATH = "/evo/identity/v2/discovery";

function getDiscoveryBaseUrl(): string {
  return import.meta.env.VITE_EVO_DISCOVERY_BASE_URL.replace(/\/+$/, "");
}

/** Fetch the discovery response for all Evo services. */
export async function fetchDiscovery(
  accessToken: string,
): Promise<DiscoveryResponse> {
  const url = `${getDiscoveryBaseUrl()}${DISCOVERY_PATH}?service=evo`;
  const result = await evoFetch({
    url,
    accessToken,
    schema: discoveryResponseSchema,
  });
  return assertOk(result, { url, method: "GET" }) as DiscoveryResponse;
}

/**
 * Resolve EvoInstance objects from the raw discovery response.
 * Joins organizations, service_access, and hubs to build a complete
 * instance with its hub URL.
 */
export function resolveInstances(
  response: DiscoveryResponse,
): EvoInstance[] {
  const { organizations, service_access, hubs } = response.discovery;

  return organizations
    .map((org) => {
      const access = service_access.find((sa) => sa.org_id === org.id);
      const hub = access
        ? hubs.find((h) => h.code === access.hub_code)
        : undefined;

      if (!hub) return null;

      return {
        id: org.id,
        displayName: org.display_name,
        hubUrl: hub.url,
        hubCode: parseHubCode(hub.code),
        hubDisplayName: hub.display_name,
      } satisfies EvoInstance;
    })
    .filter((instance): instance is EvoInstance => instance !== null);
}
