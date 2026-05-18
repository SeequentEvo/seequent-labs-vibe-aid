/**
 * Geoscience Object API — pure free-function helpers.
 *
 * All helpers accept the access token explicitly; none reach into Redux or
 * any global. Helpers either return the parsed result or throw a typed Evo
 * error (`EvoApiError`, `EvoNetworkError`, `EvoSchemaError`). Callers can
 * import flat (`import { fetchObject } from '@/api/evo/objects'`) or via a
 * namespace alias (`import * as objects from '@/api/evo/objects'` →
 * `objects.fetchObject(ref, token)`).
 *
 * URL composition rules:
 * - Object-scoped helpers receive an `EvoObjectRef` and use `ref.toUrl()`.
 *   Path-based addressing requires the wire path to end in `.json` — the
 *   ref does **not** apply that suffix today, so these helpers append it
 *   themselves (see `objectRequestUrl`). UUID-based addressing needs no
 *   suffix. Reference: `evo-resources/references/resource-metadata.md`.
 * - Workspace-collection helpers (list, create, batch, data) need URLs
 *   under the `geoscience-object` service. `EvoWorkspaceRef.toUrl()` points
 *   at the `workspace` service, so we compose the geoscience-object base
 *   URL from `ws.hubUrl` + `ws.orgId` + `ws.workspaceId`. The ref still
 *   owns identity; we are not bypassing it for addressing within its own
 *   service.
 */

import { z } from "zod";

import type { EvoObjectRef } from "./refs/object";
import type { EvoWorkspaceRef } from "./refs/workspace";
import { encodeResourcePath } from "./refs/base";
import { assertOk, evoFetch } from "./fetch";
import type { EvoMethod } from "./fetch";
import type { Page } from "./pagination";
import {
  geoscienceObjectEnvelopeSchema,
  geoscienceObjectSummarySchema,
} from "@/types/object";
import type {
  GeoscienceObjectEnvelope,
  GeoscienceObjectSummary,
} from "@/types/object";
import type { ObjectId, VersionId } from "@/types/ids";
import { objectIdSchema, versionIdSchema } from "@/types/ids";

// ---------------------------------------------------------------------------
// Limits — enforced client-side; the API rejects oversize requests too but a
// fast local error is friendlier and avoids a round trip.
// ---------------------------------------------------------------------------

/** Maximum object IDs accepted by the batch latest-version-check endpoint. */
export const BATCH_VERSION_CHECK_MAX = 500;

/** Maximum data names accepted by the data upload-URL endpoint. */
export const DATA_UPLOAD_NAMES_MAX = 32;

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/**
 * Geoscience-object base URL for a workspace.
 *
 * Constructed from the workspace ref's identity fields because
 * `EvoWorkspaceRef.toUrl()` returns the `workspace` service URL, not the
 * `geoscience-object` service URL.
 */
function workspaceObjectsBaseUrl(ws: EvoWorkspaceRef): string {
  return `${ws.hubUrl}/geoscience-object/orgs/${ws.orgId}/workspaces/${ws.workspaceId}`;
}

/**
 * Build the request URL for an object ref, appending `.json` to path-based
 * addressing because the wire format requires it. UUID-based addressing
 * passes through unchanged.
 */
function objectRequestUrl(ref: EvoObjectRef): string {
  if (ref.objectPath === null) {
    return ref.toUrl();
  }
  // Recompose so we can splice `.json` in before any `?version=` query.
  const base = `${ref.hubUrl}/geoscience-object/orgs/${ref.orgId}/workspaces/${ref.workspaceId}/objects/path/${encodeResourcePath(ref.objectPath)}.json`;
  if (ref.versionId !== null) {
    return `${base}?version=${encodeURIComponent(ref.versionId)}`;
  }
  return base;
}

function appendQuery(url: string, params: URLSearchParams): string {
  const qs = params.toString();
  if (qs.length === 0) return url;
  return url.includes("?") ? `${url}&${qs}` : `${url}?${qs}`;
}

// ---------------------------------------------------------------------------
// Types — list filters and helper response shapes
// ---------------------------------------------------------------------------

/** Filters supported by the workspace-scoped list endpoint. */
export interface ListObjectsFilters {
  limit?: number;
  offset?: number;
  /** When true, return only soft-deleted objects. */
  deleted?: boolean;
  /** Comma-separated `order_by` clause (e.g. `"object_name,desc:created_at"`). */
  orderBy?: string;
  /** Schema filters (exact match or `like:` wildcards). */
  schemaId?: string[];
  /** Object name filters (prefix match without operator; `eq:` for exact path). */
  objectName?: string[];
  /** Creator profile UUIDs. */
  createdBy?: string[];
  /** Modifier profile UUIDs. */
  modifiedBy?: string[];
  /** Deleter profile UUIDs. */
  deletedBy?: string[];
  /** ISO-8601 datetimes (max 2; supports `lt:`/`lte:`/`gt:`/`gte:` prefixes). */
  createdAt?: string[];
  /** Same syntax as `createdAt`. */
  modifiedAt?: string[];
  /** Same syntax as `createdAt`. */
  deletedAt?: string[];
  signal?: AbortSignal;
}

/** Per-entry result of `batchCheckLatestObjectVersions`. */
export interface LatestObjectVersionResult {
  objectId: ObjectId;
  versionId: VersionId | null;
}

/** Per-entry result of `requestObjectDataUploadUrls`. */
export interface DataUploadUrlResult {
  /** Server-assigned UUID for the blob. */
  id: string;
  /** Client-supplied name (SHA-256 or UUID). */
  name: string;
  /** True when the blob already exists in the workspace (no upload needed). */
  exists: boolean;
  /** Pre-signed Azure Blob URL; absent when `exists` is true. */
  uploadUrl?: string;
}

// ---------------------------------------------------------------------------
// Wire-shape Zod schemas
// ---------------------------------------------------------------------------

/**
 * Wire envelope for the Geoscience Objects list endpoint:
 *
 *     { objects: [...], offset, limit, count, total }
 *
 * Note this does NOT match the Workspaces "links" envelope shape — the
 * Geoscience Object service echoes pagination metadata flat on the body
 * with a resource-specific results key. Each service owns its own
 * envelope schema + parser; only the `Page<T>` model is shared.
 */
const listObjectsEnvelopeSchema = z
  .object({
    objects: z.array(geoscienceObjectSummarySchema),
    offset: z.number().int().nonnegative(),
    limit: z.number().int().nonnegative(),
    count: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  })
  .loose();

type ListObjectsEnvelope = z.infer<typeof listObjectsEnvelopeSchema>;

/**
 * Map the Geoscience Objects list envelope to a `Page<GeoscienceObjectSummary>`.
 * `offset` and `limit` come straight from the envelope — the API echoes
 * the request values, no need to thread them through from the caller.
 */
function parseListObjectsPage(
  envelope: ListObjectsEnvelope,
): Page<GeoscienceObjectSummary> {
  const items = envelope.objects;
  return {
    items,
    total: envelope.total,
    offset: envelope.offset,
    limit: envelope.limit,
    hasMore: envelope.offset + items.length < envelope.total,
  };
}

const latestObjectVersionResponseSchema = z.array(
  z
    .object({
      object_id: objectIdSchema,
      version_id: versionIdSchema.nullish(),
    })
    .loose()
    .transform((r) => ({
      objectId: r.object_id,
      versionId: r.version_id ?? null,
    })),
);

const dataUploadResponseSchema = z.array(
  z
    .object({
      id: z.string().min(1),
      name: z.string(),
      exists: z.boolean(),
      upload_url: z.string().nullish(),
    })
    .loose()
    .transform((r) => {
      const out: DataUploadUrlResult = {
        id: r.id,
        name: r.name,
        exists: r.exists,
      };
      if (typeof r.upload_url === "string" && r.upload_url.length > 0) {
        out.uploadUrl = r.upload_url;
      }
      return out;
    }),
);

// ---------------------------------------------------------------------------
// Filter → query-string serialisation
// ---------------------------------------------------------------------------

function buildListQuery(filters: ListObjectsFilters | undefined): URLSearchParams {
  const params = new URLSearchParams();
  if (!filters) return params;

  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  if (filters.offset !== undefined) params.set("offset", String(filters.offset));
  if (filters.deleted !== undefined) params.set("deleted", String(filters.deleted));
  if (filters.orderBy !== undefined) params.set("order_by", filters.orderBy);

  const arrayFilters: Array<[string, string[] | undefined]> = [
    ["schema_id", filters.schemaId],
    ["object_name", filters.objectName],
    ["created_by", filters.createdBy],
    ["modified_by", filters.modifiedBy],
    ["deleted_by", filters.deletedBy],
    ["created_at", filters.createdAt],
    ["modified_at", filters.modifiedAt],
    ["deleted_at", filters.deletedAt],
  ];
  for (const [key, values] of arrayFilters) {
    if (!values) continue;
    for (const v of values) params.append(key, v);
  }
  return params;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * `GET /geoscience-object/.../workspaces/{ws}/objects` — list latest-version
 * summaries with optional filters and pagination.
 *
 * Pagination defaults are owned by the server (offset 0, limit 5000).
 */
export async function listObjects(
  ws: EvoWorkspaceRef,
  accessToken: string,
  filters?: ListObjectsFilters,
): Promise<Page<GeoscienceObjectSummary>> {
  const params = buildListQuery(filters);
  const url = appendQuery(`${workspaceObjectsBaseUrl(ws)}/objects`, params);
  const method: EvoMethod = "GET";

  const result = await evoFetch({
    url,
    method,
    accessToken,
    schema: listObjectsEnvelopeSchema,
    signal: filters?.signal,
  });
  const envelope = assertOk(result, { url, method });

  return parseListObjectsPage(envelope);
}

/** Options for `fetchObject`. */
export interface FetchObjectOptions {
  /** Include the full version history in the response. */
  includeVersions?: boolean;
  /** Fetch a soft-deleted object. **UUID addressing only**; not supported on path-based refs. */
  deleted?: boolean;
  signal?: AbortSignal;
}

/**
 * `GET /geoscience-object/.../objects/{id|path/...}` — download a single
 * object envelope.
 */
export async function fetchObject(
  ref: EvoObjectRef,
  accessToken: string,
  options: FetchObjectOptions = {},
): Promise<GeoscienceObjectEnvelope> {
  const params = new URLSearchParams();
  if (options.includeVersions) params.set("include_versions", "true");
  if (options.deleted !== undefined) params.set("deleted", String(options.deleted));
  const url = appendQuery(objectRequestUrl(ref), params);
  const method: EvoMethod = "GET";

  const result = await evoFetch({
    url,
    method,
    accessToken,
    schema: geoscienceObjectEnvelopeSchema,
    signal: options.signal,
  });
  return assertOk(result, { url, method });
}

/** Body accepted by `createObject`. */
export interface CreateObjectBody {
  /** User-facing object path (without the `.json` suffix). */
  path: string;
  /** The geoscience-object body. Set its `uuid` field to `null` for new objects. */
  object: unknown;
}

/**
 * `POST /geoscience-object/.../objects/path/{path}.json` — create (or create
 * a new version of) an object addressed by path. Set `body.object.uuid` to
 * `null` for a brand-new object.
 */
export async function createObject(
  ws: EvoWorkspaceRef,
  body: CreateObjectBody,
  accessToken: string,
): Promise<GeoscienceObjectEnvelope> {
  const url = `${workspaceObjectsBaseUrl(ws)}/objects/path/${encodeResourcePath(body.path)}.json`;
  const method: EvoMethod = "POST";

  const result = await evoFetch({
    url,
    method,
    accessToken,
    body: body.object,
    gzip: true,
    schema: geoscienceObjectEnvelopeSchema,
  });
  return assertOk(result, { url, method });
}

/**
 * `POST /geoscience-object/.../objects/{id}` — replace an existing object
 * (creates a new version). The body's `uuid` field must match the ref's
 * UUID.
 */
export async function updateObject(
  ref: EvoObjectRef,
  body: unknown,
  accessToken: string,
): Promise<GeoscienceObjectEnvelope> {
  const url = objectRequestUrl(ref);
  const method: EvoMethod = "POST";

  const result = await evoFetch({
    url,
    method,
    accessToken,
    body,
    schema: geoscienceObjectEnvelopeSchema,
  });
  return assertOk(result, { url, method });
}

/**
 * `DELETE /geoscience-object/.../objects/{id|path/...}` — soft-delete an
 * object.
 */
export async function deleteObject(
  ref: EvoObjectRef,
  accessToken: string,
): Promise<void> {
  const url = objectRequestUrl(ref);
  const method: EvoMethod = "DELETE";

  const result = await evoFetch({ url, method, accessToken });
  assertOk(result, { url, method });
}

/**
 * `POST /geoscience-object/.../objects/{id}?deleted=false` — restore a
 * soft-deleted object. The body must be empty. **UUID-only**; restore is
 * not available via the path endpoint.
 */
export async function restoreObject(
  ref: EvoObjectRef,
  accessToken: string,
): Promise<void> {
  if (ref.objectId === null) {
    throw new Error(
      "restoreObject requires a UUID-addressed EvoObjectRef; restore is not available via the path endpoint.",
    );
  }
  const base = `${ref.hubUrl}/geoscience-object/orgs/${ref.orgId}/workspaces/${ref.workspaceId}/objects/${ref.objectId}`;
  const url = `${base}?deleted=false`;
  const method: EvoMethod = "POST";

  // Empty body — the endpoint rejects an object body when restoring.
  const result = await evoFetch({ url, method, accessToken });
  assertOk(result, { url, method });
}

/**
 * `PATCH /geoscience-object/.../workspaces/{ws}/objects` — fetch the latest
 * version ID for up to {@link BATCH_VERSION_CHECK_MAX} objects. The wire
 * body is a bare array of UUIDs. Missing or deleted objects come back with
 * `versionId: null`.
 */
export async function batchCheckLatestObjectVersions(
  ws: EvoWorkspaceRef,
  ids: ObjectId[],
  accessToken: string,
): Promise<LatestObjectVersionResult[]> {
  if (ids.length === 0) {
    throw new Error("batchCheckLatestObjectVersions requires at least one object ID.");
  }
  if (ids.length > BATCH_VERSION_CHECK_MAX) {
    throw new Error(
      `batchCheckLatestObjectVersions accepts at most ${String(BATCH_VERSION_CHECK_MAX)} IDs per request; got ${String(ids.length)}.`,
    );
  }
  const url = `${workspaceObjectsBaseUrl(ws)}/objects`;
  const method: EvoMethod = "PATCH";

  const result = await evoFetch({
    url,
    method,
    accessToken,
    body: ids,
    schema: latestObjectVersionResponseSchema,
  });
  return assertOk(result, { url, method });
}

/**
 * `PUT /geoscience-object/.../workspaces/{ws}/data` — request pre-signed
 * upload URLs for up to {@link DATA_UPLOAD_NAMES_MAX} data blobs at once.
 *
 * Each `name` must be a SHA-256 (64 hex chars) or a UUID. Existing blobs
 * come back as `{ exists: true }` with no `uploadUrl` (de-duplication).
 */
export async function requestObjectDataUploadUrls(
  ws: EvoWorkspaceRef,
  names: string[],
  accessToken: string,
): Promise<DataUploadUrlResult[]> {
  if (names.length === 0) {
    throw new Error("requestObjectDataUploadUrls requires at least one name.");
  }
  if (names.length > DATA_UPLOAD_NAMES_MAX) {
    throw new Error(
      `requestObjectDataUploadUrls accepts at most ${String(DATA_UPLOAD_NAMES_MAX)} names per request; got ${String(names.length)}.`,
    );
  }
  const url = `${workspaceObjectsBaseUrl(ws)}/data`;
  const method: EvoMethod = "PUT";

  const body = names.map((name) => ({ name }));
  const result = await evoFetch({
    url,
    method,
    accessToken,
    body,
    schema: dataUploadResponseSchema,
  });
  return assertOk(result, { url, method });
}

/**
 * Pure helper — extract a `Map<key, downloadUrl>` from an object envelope's
 * `links.data` array. The map is keyed by `link.name ?? link.id` (per the
 * data-blobs reference: prefer the client-provided name, fall back to the
 * server-assigned UUID for legacy data uploaded before the `name` field
 * existed). Entries with a `null`/missing download URL are skipped.
 */
export function extractObjectDataDownloadUrls(
  envelope: GeoscienceObjectEnvelope,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const link of envelope.links.data ?? []) {
    if (link.downloadUrl === null) continue;
    const key = link.name || link.id;
    out.set(key, link.downloadUrl);
  }
  return out;
}
