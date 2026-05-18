/**
 * Evo Workspaces API client.
 *
 * Lists and manages workspaces within an Evo instance.
 * All requests go to the hub URL resolved through the Discovery API.
 */

import { z } from "zod";
import type { OrgId, WorkspaceId } from "@/types/ids";
import { workspaceIdSchema, userIdSchema } from "@/types/ids";
import type { Workspace } from "@/types/evo";
import { assertOk, evoFetch } from "./fetch";
import type { Page } from "./pagination";

const evoUserSchema = z.object({
  id: userIdSchema,
  name: z.string(),
  email: z.string(),
});

const workspaceSchema = z.object({
  id: workspaceIdSchema,
  name: z.string(),
  description: z.string(),
  current_user_role: z.enum(["owner", "editor", "viewer"]),
  created_at: z.string(),
  created_by: evoUserSchema,
  updated_at: z.string(),
  updated_by: evoUserSchema,
  labels: z.array(z.string()),
  self_link: z.string(),
});

/**
 * Wire envelope for the Workspaces list endpoint.
 *
 *     { links: { count, total, first, last, next, previous, ... },
 *       results: [...] }
 *
 * `links` is permissive — only `count` and `total` are required; the
 * navigation fields (`first`, `last`, `next`, `previous`) are accepted but
 * unused (we reconstruct `hasMore` from `offset + items.length < total`).
 */
const listWorkspacesEnvelopeSchema = z.looseObject({
  links: z.looseObject({
    count: z.number(),
    total: z.number(),
  }),
  results: z.array(workspaceSchema),
});

type ListWorkspacesEnvelope = z.infer<typeof listWorkspacesEnvelopeSchema>;

/**
 * Map the Workspaces list envelope to a `Page<Workspace>`. The caller
 * passes the request's `offset`/`limit` because the wire envelope only
 * echoes `count` and `total`.
 */
function parseListWorkspacesPage(
  envelope: ListWorkspacesEnvelope,
  params: { offset: number; limit: number },
): Page<Workspace> {
  const items = envelope.results;
  return {
    items,
    total: envelope.links.total,
    offset: params.offset,
    limit: params.limit,
    hasMore: params.offset + items.length < envelope.links.total,
  };
}

const DEFAULT_LIMIT = 20;

/** Fetch a page of workspaces for the given instance. */
export async function fetchWorkspaces(
  hubUrl: string,
  orgId: OrgId,
  accessToken: string,
  options: { limit?: number; offset?: number; orderBy?: string } = {},
): Promise<Page<Workspace>> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const offset = options.offset ?? 0;

  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));
  if (options.orderBy) params.set("order_by", options.orderBy);

  const url = `${hubUrl}/workspace/orgs/${orgId}/workspaces?${params.toString()}`;
  const result = await evoFetch({
    url,
    accessToken,
    schema: listWorkspacesEnvelopeSchema,
  });
  const envelope = assertOk(result, { url, method: "GET" });
  return parseListWorkspacesPage(envelope, { offset, limit });
}

/**
 * Lightweight workspace summary — id + name only.
 *
 * The `/workspaces/summary` endpoint is designed for selectors and
 * navigation chrome where full workspace metadata would be wasteful.
 */
export interface WorkspaceSummary {
  id: WorkspaceId;
  name: string;
}

const workspaceSummarySchema = z.object({
  id: workspaceIdSchema,
  name: z.string(),
});

const workspaceSummariesResponseSchema = z.union([
  z.array(workspaceSummarySchema),
  z.looseObject({ results: z.array(workspaceSummarySchema) }),
]);

/**
 * Fetch all workspace summaries for an instance.
 *
 * Returns a flat list (no pagination); the summary endpoint is intentionally
 * lightweight so the whole set fits in a single response.
 */
export async function fetchWorkspaceSummaries(
  hubUrl: string,
  orgId: OrgId,
  accessToken: string,
): Promise<WorkspaceSummary[]> {
  const url = `${hubUrl}/workspace/orgs/${orgId}/workspaces/summary`;
  const result = await evoFetch({
    url,
    accessToken,
    schema: workspaceSummariesResponseSchema,
  });
  const body = assertOk(result, { url, method: "GET" });
  return Array.isArray(body) ? body : body.results;
}

/** Fetch the thumbnail URL for a workspace. Returns null if no thumbnail. */
export function getWorkspaceThumbnailUrl(
  hubUrl: string,
  orgId: OrgId,
  workspaceId: WorkspaceId,
): string {
  return `${hubUrl}/workspace/orgs/${orgId}/workspaces/${workspaceId}/thumbnail`;
}
