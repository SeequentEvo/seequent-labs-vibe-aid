/**
 * Geoscience Object API types and Zod schemas.
 *
 * The wire format uses snake_case; these schemas transform to camelCase on
 * parse so callers and selectors deal with idiomatic TypeScript shapes.
 *
 * Object bodies are kept opaque (`object: unknown`) — schema-typed parsing
 * is a future iteration. Use the `schema` field as a discriminator and
 * parse with the appropriate evo-schemas type when ready.
 */

import { z } from "zod";

import {
  objectIdSchema,
  objectPathSchema,
  stageIdSchema,
  userIdSchema,
  versionIdSchema,
} from "./ids";
import type {
  ObjectId,
  ObjectPath,
  StageId,
  UserId,
  VersionId,
} from "./ids";

// ---------------------------------------------------------------------------
// Shared sub-shapes
// ---------------------------------------------------------------------------

/**
 * Evo `User` envelope as returned inline on object responses.
 *
 * Mirrors the OpenAPI `User` schema (id required UUID; name and email
 * optional and nullable). Distinct from the higher-level `EvoUser` which
 * assumes name and email are present.
 */
export interface EvoUserLike {
  id: UserId;
  name: string | null;
  email: string | null;
}

export const evoUserLikeSchema: z.ZodType<EvoUserLike> = z
  .object({
    id: userIdSchema,
    name: z.string().nullish(),
    email: z.string().nullish(),
  })
  .transform((u) => ({
    id: u.id,
    name: u.name ?? null,
    email: u.email ?? null,
  }));

/** Stage attached to an object version. */
export interface Stage {
  stageId: StageId;
  name: string;
}

export const stageSchema: z.ZodType<Stage> = z
  .object({
    stage_id: stageIdSchema,
    name: z.string(),
  })
  .transform((s) => ({
    stageId: s.stage_id,
    name: s.name,
  }));

// ---------------------------------------------------------------------------
// Data blobs (download URLs returned with an object envelope)
// ---------------------------------------------------------------------------

/**
 * Pre-signed download URL for a Parquet data blob referenced by an object.
 *
 * `name` is the client-provided reference (SHA-256 hash or UUID) that
 * matches the `data` field inside the object body. `id` is the
 * server-assigned UUID for the blob. Use `name` as the primary lookup
 * key and fall back to `id` for legacy blobs uploaded before the `name`
 * field existed.
 */
export interface DataLink {
  id: string;
  name: string;
  downloadUrl: string | null;
}

export const dataLinkSchema: z.ZodType<DataLink> = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    download_url: z.string().nullish(),
  })
  .transform((d) => ({
    id: d.id,
    name: d.name,
    downloadUrl: d.download_url ?? null,
  }));

// ---------------------------------------------------------------------------
// List entry — what `GET /objects` returns per item
// ---------------------------------------------------------------------------

/** Lightweight summary for an object list entry. */
export interface GeoscienceObjectSummary {
  objectId: ObjectId;
  name: string;
  path: ObjectPath;
  schema: string;
  versionId: VersionId;
  etag: string;
  createdAt: string;
  createdBy: EvoUserLike | null;
  modifiedAt: string;
  modifiedBy: EvoUserLike | null;
  deletedAt: string | null;
  deletedBy: EvoUserLike | null;
  stage: Stage | null;
}

export const geoscienceObjectSummarySchema: z.ZodType<GeoscienceObjectSummary> =
  z
    .object({
      object_id: objectIdSchema,
      name: z.string(),
      path: objectPathSchema,
      schema: z.string(),
      version_id: versionIdSchema,
      etag: z.string(),
      created_at: z.string(),
      created_by: evoUserLikeSchema.nullish(),
      modified_at: z.string(),
      modified_by: evoUserLikeSchema.nullish(),
      deleted_at: z.string().nullish(),
      deleted_by: evoUserLikeSchema.nullish(),
      stage: stageSchema.nullish(),
    })
    .loose()
    .transform((o) => ({
      objectId: o.object_id,
      name: o.name,
      path: o.path,
      schema: o.schema,
      versionId: o.version_id,
      etag: o.etag,
      createdAt: o.created_at,
      createdBy: o.created_by ?? null,
      modifiedAt: o.modified_at,
      modifiedBy: o.modified_by ?? null,
      deletedAt: o.deleted_at ?? null,
      deletedBy: o.deleted_by ?? null,
      stage: o.stage ?? null,
    }));

// ---------------------------------------------------------------------------
// Full envelope — what `GET /objects/{id}` returns
// ---------------------------------------------------------------------------

/** A historical version entry returned when `?include_versions=true`. */
export interface GeoscienceObjectVersionEntry {
  versionId: VersionId;
  createdAt: string;
  createdBy: EvoUserLike | null;
  etag: string;
  stage: Stage | null;
}

export const geoscienceObjectVersionEntrySchema: z.ZodType<GeoscienceObjectVersionEntry> =
  z
    .object({
      version_id: versionIdSchema,
      created_at: z.string(),
      created_by: evoUserLikeSchema.nullish(),
      etag: z.string(),
      stage: stageSchema.nullish(),
    })
    .loose()
    .transform((v) => ({
      versionId: v.version_id,
      createdAt: v.created_at,
      createdBy: v.created_by ?? null,
      etag: v.etag,
      stage: v.stage ?? null,
    }));

/** `links` block on an object envelope. */
export interface GeoscienceObjectLinks {
  download?: string;
  data?: DataLink[];
}

const geoscienceObjectLinksSchema: z.ZodType<GeoscienceObjectLinks> = z
  .object({
    download: z.string().optional(),
    data: z.array(dataLinkSchema).optional(),
  })
  .loose()
  .transform((l) => {
    const out: GeoscienceObjectLinks = {};
    if (typeof l.download === "string") out.download = l.download;
    if (Array.isArray(l.data)) out.data = l.data;
    return out;
  });

/**
 * Full object envelope returned by `GET /objects/{id}` and
 * `GET /objects/path/{path}`.
 *
 * The `object` field is intentionally typed as `unknown`: schema-typed
 * parsing is a future iteration. Use the `schema` field as a discriminator
 * and parse with the appropriate evo-schemas type when ready.
 */
export interface GeoscienceObjectEnvelope {
  objectId: ObjectId;
  path: ObjectPath | null;
  schema: string;
  versionId: VersionId;
  etag: string;
  createdAt: string;
  createdBy: EvoUserLike | null;
  modifiedAt: string;
  modifiedBy: EvoUserLike | null;
  deletedAt: string | null;
  deletedBy: EvoUserLike | null;
  stage: Stage | null;
  /**
   * Opaque object body. Schema-typed parsing of this field is a future
   * iteration. Use the `schema` field as a discriminator and parse with
   * the appropriate evo-schemas type when ready.
   */
  object: unknown;
  links: GeoscienceObjectLinks;
  versions?: GeoscienceObjectVersionEntry[];
}

export const geoscienceObjectEnvelopeSchema: z.ZodType<GeoscienceObjectEnvelope> =
  z
    .object({
      object_id: objectIdSchema,
      object_path: objectPathSchema.nullish(),
      // `schema` lives on the inner `object` body in the wire format —
      // surface it on the envelope for convenience.
      object: z.unknown(),
      version_id: versionIdSchema,
      etag: z.string(),
      created_at: z.string(),
      created_by: evoUserLikeSchema.nullish(),
      modified_at: z.string(),
      modified_by: evoUserLikeSchema.nullish(),
      deleted_at: z.string().nullish(),
      deleted_by: evoUserLikeSchema.nullish(),
      stage: stageSchema.nullish(),
      links: geoscienceObjectLinksSchema,
      versions: z.array(geoscienceObjectVersionEntrySchema).nullish(),
    })
    .loose()
    .transform((o) => {
      const body = o.object;
      const schema =
        body !== null &&
        typeof body === "object" &&
        "schema" in body &&
        typeof (body as { schema: unknown }).schema === "string"
          ? (body as { schema: string }).schema
          : "";
      const env: GeoscienceObjectEnvelope = {
        objectId: o.object_id,
        path: o.object_path ?? null,
        schema,
        versionId: o.version_id,
        etag: o.etag,
        createdAt: o.created_at,
        createdBy: o.created_by ?? null,
        modifiedAt: o.modified_at,
        modifiedBy: o.modified_by ?? null,
        deletedAt: o.deleted_at ?? null,
        deletedBy: o.deleted_by ?? null,
        stage: o.stage ?? null,
        object: body,
        links: o.links,
      };
      if (Array.isArray(o.versions)) env.versions = o.versions;
      return env;
    });
