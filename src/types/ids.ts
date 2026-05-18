/**
 * Branded ID types and Zod schemas for Evo resource identifiers.
 *
 * Two brand families:
 * - **UUID-validated** (extend `UUID`): validated as UUID any-version on parse.
 * - **Opaque-string** (do NOT extend `UUID`): no format check, just non-empty.
 *
 * Use `parseX` at trust boundaries (throws on invalid input).
 * Use `tryParseX` where invalid input should be treated as missing (returns null).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Brand machinery
// ---------------------------------------------------------------------------

declare const brand: unique symbol;

/**
 * Record-based brand: each brand key is a distinct property in the brand record.
 * This ensures `OrgId` is assignable to `UUID` (both have `{ UUID: true }`) but
 * `OrgId` is NOT assignable to `WorkspaceId` (missing `{ WorkspaceId: true }`).
 */
type Brand<T, B extends Record<string, true>> = T & { readonly [brand]: B };

// ---------------------------------------------------------------------------
// UUID-validated brands
// ---------------------------------------------------------------------------

/** Base UUID brand — any RFC 4122 UUID version. */
export type UUID = Brand<string, { UUID: true }>;

/** Organisation / instance ID. */
export type OrgId = Brand<string, { UUID: true; OrgId: true }>;

/** Workspace ID. */
export type WorkspaceId = Brand<string, { UUID: true; WorkspaceId: true }>;

/** File resource ID. */
export type FileId = Brand<string, { UUID: true; FileId: true }>;

/** Geoscience object ID. */
export type ObjectId = Brand<string, { UUID: true; ObjectId: true }>;

/** Block model ID. */
export type BlockModelId = Brand<string, { UUID: true; BlockModelId: true }>;

/** Colormap ID. */
export type ColormapId = Brand<string, { UUID: true; ColormapId: true }>;

/** Object lifecycle stage ID. */
export type StageId = Brand<string, { UUID: true; StageId: true }>;

// ---------------------------------------------------------------------------
// Opaque-string brands (no UUID format check)
// ---------------------------------------------------------------------------

/** Version identifier — opaque per Evo contract. */
export type VersionId = Brand<string, { VersionId: true }>;

/** Geoscience object path (slash-delimited). */
export type ObjectPath = Brand<string, { ObjectPath: true }>;

/** File path (slash-delimited). */
export type FilePath = Brand<string, { FilePath: true }>;

/** User ID — IMS `sub` claim, opaque per OIDC spec. */
export type UserId = Brand<string, { UserId: true }>;

/** Hub code (e.g. "us-aws"). */
export type HubCode = Brand<string, { HubCode: true }>;

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const uuidBase = z.uuid();
const opaqueBase = z.string().min(1);

export const uuidSchema = uuidBase.transform((v) => v as UUID);

export const orgIdSchema = uuidBase.transform((v) => v as OrgId);
export const workspaceIdSchema = uuidBase.transform((v) => v as WorkspaceId);
export const fileIdSchema = uuidBase.transform((v) => v as FileId);
export const objectIdSchema = uuidBase.transform((v) => v as ObjectId);
export const blockModelIdSchema = uuidBase.transform(
  (v) => v as BlockModelId,
);
export const colormapIdSchema = uuidBase.transform((v) => v as ColormapId);
export const stageIdSchema = uuidBase.transform((v) => v as StageId);

export const versionIdSchema = opaqueBase.transform((v) => v as VersionId);
export const objectPathSchema = opaqueBase.transform((v) => v as ObjectPath);
export const filePathSchema = opaqueBase.transform((v) => v as FilePath);
export const userIdSchema = opaqueBase.transform((v) => v as UserId);
export const hubCodeSchema = opaqueBase.transform((v) => v as HubCode);

// ---------------------------------------------------------------------------
// Parse helpers — UUID brands
// ---------------------------------------------------------------------------

export const parseUUID = (v: unknown): UUID => uuidSchema.parse(v);
export const tryParseUUID = (v: unknown): UUID | null => {
  const r = uuidSchema.safeParse(v);
  return r.success ? r.data : null;
};

export const parseOrgId = (v: unknown): OrgId => orgIdSchema.parse(v);
export const tryParseOrgId = (v: unknown): OrgId | null => {
  const r = orgIdSchema.safeParse(v);
  return r.success ? r.data : null;
};

export const parseWorkspaceId = (v: unknown): WorkspaceId =>
  workspaceIdSchema.parse(v);
export const tryParseWorkspaceId = (v: unknown): WorkspaceId | null => {
  const r = workspaceIdSchema.safeParse(v);
  return r.success ? r.data : null;
};

export const parseFileId = (v: unknown): FileId => fileIdSchema.parse(v);
export const tryParseFileId = (v: unknown): FileId | null => {
  const r = fileIdSchema.safeParse(v);
  return r.success ? r.data : null;
};

export const parseObjectId = (v: unknown): ObjectId =>
  objectIdSchema.parse(v);
export const tryParseObjectId = (v: unknown): ObjectId | null => {
  const r = objectIdSchema.safeParse(v);
  return r.success ? r.data : null;
};

export const parseBlockModelId = (v: unknown): BlockModelId =>
  blockModelIdSchema.parse(v);
export const tryParseBlockModelId = (v: unknown): BlockModelId | null => {
  const r = blockModelIdSchema.safeParse(v);
  return r.success ? r.data : null;
};

export const parseColormapId = (v: unknown): ColormapId =>
  colormapIdSchema.parse(v);
export const tryParseColormapId = (v: unknown): ColormapId | null => {
  const r = colormapIdSchema.safeParse(v);
  return r.success ? r.data : null;
};

export const parseStageId = (v: unknown): StageId => stageIdSchema.parse(v);
export const tryParseStageId = (v: unknown): StageId | null => {
  const r = stageIdSchema.safeParse(v);
  return r.success ? r.data : null;
};

// ---------------------------------------------------------------------------
// Parse helpers — opaque brands
// ---------------------------------------------------------------------------

export const parseVersionId = (v: unknown): VersionId =>
  versionIdSchema.parse(v);
export const tryParseVersionId = (v: unknown): VersionId | null => {
  const r = versionIdSchema.safeParse(v);
  return r.success ? r.data : null;
};

export const parseObjectPath = (v: unknown): ObjectPath =>
  objectPathSchema.parse(v);
export const tryParseObjectPath = (v: unknown): ObjectPath | null => {
  const r = objectPathSchema.safeParse(v);
  return r.success ? r.data : null;
};

export const parseFilePath = (v: unknown): FilePath =>
  filePathSchema.parse(v);
export const tryParseFilePath = (v: unknown): FilePath | null => {
  const r = filePathSchema.safeParse(v);
  return r.success ? r.data : null;
};

export const parseUserId = (v: unknown): UserId => userIdSchema.parse(v);
export const tryParseUserId = (v: unknown): UserId | null => {
  const r = userIdSchema.safeParse(v);
  return r.success ? r.data : null;
};

export const parseHubCode = (v: unknown): HubCode => hubCodeSchema.parse(v);
export const tryParseHubCode = (v: unknown): HubCode | null => {
  const r = hubCodeSchema.safeParse(v);
  return r.success ? r.data : null;
};
