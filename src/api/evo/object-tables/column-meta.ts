/**
 * Typed accessors for Arrow Field.metadata — encodes column provenance
 * (role, source, blob ref, etc.) directly into the Arrow schema.
 */

import type { Field, Vector } from "apache-arrow";

const ROLE_KEY = "evo:role";
const SOURCE_KEY = "evo:source";
const BLOB_REF_KEY = "evo:blobRef";
const ATTRIBUTE_TYPE_KEY = "evo:attributeType";
const TARGET_ATTACHMENT_KEY = "evo:targetAttachmentId";
const NULLS_APPLIED_KEY = "evo:nullsApplied";
const GROUP_ID_KEY = "evo:schemaColumnGroupId";
const NO_DATA_KEY = "evo:noData";

export type ColumnRole = "identity" | "schema-column" | "attribute-value";

export function getColumnRole(field: Field): ColumnRole | undefined {
  return field.metadata.get(ROLE_KEY) as ColumnRole | undefined;
}

export function getColumnSource(field: Field): string | undefined {
  return field.metadata.get(SOURCE_KEY);
}

export function getColumnBlobRef(field: Field): string | undefined {
  return field.metadata.get(BLOB_REF_KEY);
}

export function getColumnAttributeType(field: Field): string | undefined {
  return field.metadata.get(ATTRIBUTE_TYPE_KEY);
}

export function getColumnTargetAttachmentId(field: Field): string | undefined {
  return field.metadata.get(TARGET_ATTACHMENT_KEY);
}

/** Get the schema column group ID from a field's metadata. */
export function getSchemaColumnGroupId(field: Field): string | undefined {
  return field.metadata.get(GROUP_ID_KEY);
}

export function wasNullApplied(field: Field): boolean {
  return field.metadata.get(NULLS_APPLIED_KEY) === "true";
}

/** Whether this column was synthesised from a `data: null` element (no binary data uploaded). */
export function wasNoData(field: Field): boolean {
  return field.metadata.get(NO_DATA_KEY) === "true";
}

/** A single decoded column ready for table assembly. */
export interface DecodedColumn {
  readonly name: string;
  readonly data: Vector;
  readonly metadata: Map<string, string>;
}

/** Build a metadata Map for a column. */
export function buildColumnMetadata(opts: {
  role: ColumnRole;
  source: string;
  blobRef: string;
  attributeType?: string;
  targetAttachmentId?: string;
  nullsApplied?: boolean;
  schemaColumnGroupId?: string;
  noData?: boolean;
}): Map<string, string> {
  const m = new Map<string, string>();
  m.set(ROLE_KEY, opts.role);
  m.set(SOURCE_KEY, opts.source);
  m.set(BLOB_REF_KEY, opts.blobRef);
  if (opts.attributeType) m.set(ATTRIBUTE_TYPE_KEY, opts.attributeType);
  if (opts.targetAttachmentId) m.set(TARGET_ATTACHMENT_KEY, opts.targetAttachmentId);
  if (opts.nullsApplied !== undefined) m.set(NULLS_APPLIED_KEY, String(opts.nullsApplied));
  if (opts.schemaColumnGroupId) m.set(GROUP_ID_KEY, opts.schemaColumnGroupId);
  if (opts.noData !== undefined) m.set(NO_DATA_KEY, String(opts.noData));
  return m;
}
