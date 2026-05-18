/**
 * Public surface of the object-tables module.
 *
 * Provides schema-driven interpretation of geoscience objects as
 * row-indexed Arrow tables.
 */

// Public types
export type {
  AttachmentDescriptor,
  AttachmentTable,
  AttributeData,
  AttributeDescriptor,
  AttributeKind,
  AttributeSelector,
  CategoryColumnGroupDescriptor,
  ElementSchema,
  IdentityRef,
  LoadAttachmentOptions,
  NanDescription,
  ObjectDescription,
  PerAttributeError,
  PerEnvelopeError,
  PerSchemaColumnGroupError,
  SchemaColumnGroupDescriptor,
  SchemaColumnSelector,
  SupportedAttributeType,
  SupportedObjectDescription,
  UnsupportedObjectDescription,
} from "./types";

// Column metadata accessors
export type { ColumnRole, DecodedColumn } from "./column-meta";
export {
  buildColumnMetadata,
  getColumnRole,
  getColumnSource,
  getColumnBlobRef,
  getColumnAttributeType,
  getColumnTargetAttachmentId,
  getSchemaColumnGroupId,
  wasNullApplied,
  wasNoData,
} from "./column-meta";

// Schema descriptor types
export type {
  AttachmentBlueprint,
  CategoryColumnBlueprint,
  SchemaColumnBlueprint,
  SchemaDescriptor,
} from "./schemas/types";

// Schema registry
export { lookupDescriptor } from "./schemas/registry";

// Core API
export { describeObject, loadAttachment } from "./loader";
export type { LoadDeps } from "./loader";
