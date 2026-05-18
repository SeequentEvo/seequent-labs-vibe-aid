import type { Table } from "apache-arrow";

import type { BlobRef } from "@/api/evo/blob";

// ---- attribute_type enum ----

/** Supported attribute types we can decode into Arrow columns. */
export type SupportedAttributeType =
  | "scalar"
  | "category"
  | "bool"
  | "color"
  | "string"
  | "integer"
  | "date_time"
  | "vector"
  | "indices";

/** Discriminated kind — faithful to the schema's attribute_type. */
export type AttributeKind =
  | { readonly decoded: true; readonly type: SupportedAttributeType }
  | { readonly decoded: false; readonly type: string };

// ---- Element schema (declared Parquet shape) ----

/** Expected data type and column count from the element JSON. */
export interface ElementSchema {
  readonly dataType: string;
  readonly width: number;
}

// ---- NaN description ----

/** Sentinel values that represent NaN/missing in attribute data. */
export interface NanDescription {
  readonly values: readonly number[];
}

// ---- Identity reference (discriminated union) ----

/** Identity element backed by a Parquet blob. */
export interface IdentityBlobRef {
  readonly kind: "blob";
  /** SHA-256 or UUID reference to the Parquet blob. */
  readonly blobRef: BlobRef;
  /** Number of rows in the identity table. */
  readonly rowCount: number;
  /** Canonical column names in order (e.g. ["x", "y", "z"]). */
  readonly columns: readonly string[];
  /** Expected Parquet schema from the element JSON. */
  readonly elementSchema: ElementSchema;
}

/** Identity element declared in the envelope but carrying no binary data (`data: null, length: 0`). */
export interface IdentityEmptyRef {
  readonly kind: "empty";
  readonly rowCount: 0;
  /** Canonical column names in order (e.g. ["x", "y", "z"]). */
  readonly columns: readonly string[];
  /** Expected Parquet schema from the element JSON (used to synthesise 0-row columns). */
  readonly elementSchema: ElementSchema;
}

/** Reference to an identity element within an attachment. */
export type IdentityRef = IdentityBlobRef | IdentityEmptyRef;

// ---- Column metadata ----

// Column provenance is now stored in Arrow Field.metadata.
// See column-meta.ts for typed accessors.

// ---- Per-attribute error ----

/** Per-attribute error from validation or decode failures. */
export interface PerAttributeError {
  readonly attributeKey: string;
  readonly attributeName: string;
  readonly message: string;
}

// ---- Per-schema-column-group error ----

/** Per-group error from validation or decode failures for schema column groups. */
export interface PerSchemaColumnGroupError {
  readonly groupId: string;
  readonly groupLabel: string;
  readonly message: string;
}

// ---- Per-envelope error ----

/** Error from malformed element JSON that prevents resolve (not a decode/validation error). */
export interface PerEnvelopeError {
  readonly scope: "identity" | "schemaColumnGroup" | "categoryColumn" | "attribute";
  readonly id: string;
  readonly label: string;
  readonly message: string;
}

// ---- Category column group descriptor (discriminated union) ----

/** Category column backed by codes + lookup blobs. */
export interface CategoryColumnGroupBlobDescriptor {
  readonly kind: "blob";
  readonly id: string;
  readonly label: string;
  readonly codesBlobRef: BlobRef;
  readonly lookupBlobRef: BlobRef;
  readonly rowCount: number;
}

/** Category column declared but carrying no binary data. */
export interface CategoryColumnGroupEmptyDescriptor {
  readonly kind: "empty";
  readonly id: string;
  readonly label: string;
  readonly rowCount: 0;
}

/** Descriptor for a schema-fixed category-data field within an attachment. */
export type CategoryColumnGroupDescriptor =
  | CategoryColumnGroupBlobDescriptor
  | CategoryColumnGroupEmptyDescriptor;

// ---- Attribute data (discriminated union) ----

/** Attribute data backed by Parquet blob(s). */
export interface AttributeDataBlob {
  readonly kind: "blob";
  readonly blobs: readonly BlobRef[];
}

/** Attribute element declared but carrying no binary data. */
export interface AttributeDataEmpty {
  readonly kind: "empty";
}

/** Discriminated union for the data backing an attribute. */
export type AttributeData = AttributeDataBlob | AttributeDataEmpty;

// ---- Attribute descriptor ----

/** Descriptor for one attribute within an attachment. */
export interface AttributeDescriptor {
  /** Stable key from the attribute's `key` field (unique within its attachment). */
  readonly key: string;
  /** Human-readable display name from the attribute's `name` field. */
  readonly name: string;
  /** Discriminated attribute kind — preserves raw type for un-decoded attributes. */
  readonly kind: AttributeKind;
  /** Column(s) this attribute will contribute to the wide table. Empty when !kind.decoded. */
  readonly columns: readonly string[];
  /** NaN description, if the attribute schema provides one. */
  readonly nanDescription: NanDescription | null;
  /** Discriminated data backing — blob refs or empty (data: null + length: 0). */
  readonly attributeData: AttributeData;
  /** Expected Parquet schema from the values element JSON. Null for un-decoded attributes. */
  readonly elementSchema: ElementSchema | null;
  /** True when this attribute shares its `key` with another attribute in the same attachment. */
  readonly duplicateKey: boolean;
}

// ---- Schema column group descriptor (discriminated union) ----

/** Schema column group backed by a Parquet blob. */
export interface SchemaColumnGroupBlobDescriptor {
  readonly kind: "blob";
  readonly id: string;
  readonly label: string;
  readonly columns: readonly string[];
  readonly blobRef: BlobRef;
  readonly rowCount: number;
  readonly elementSchema: ElementSchema;
}

/** Schema column group declared but carrying no binary data. */
export interface SchemaColumnGroupEmptyDescriptor {
  readonly kind: "empty";
  readonly id: string;
  readonly label: string;
  readonly columns: readonly string[];
  readonly rowCount: 0;
  readonly elementSchema: ElementSchema;
}

/** Descriptor for a schema-prescribed column group within an attachment. */
export type SchemaColumnGroupDescriptor =
  | SchemaColumnGroupBlobDescriptor
  | SchemaColumnGroupEmptyDescriptor;

// ---- Attachment descriptor ----

/** Descriptor for one attachment point within a supported object. */
export interface AttachmentDescriptor {
  /** Stable identifier for this attachment (e.g. "locations", "triangles.vertices"). */
  readonly id: string;
  /** JSON path from the object body root to the attachment node. */
  readonly jsonPath: readonly string[];
  /** Number of rows in this attachment (from the identity element or the first attribute). */
  readonly rowCount: number;
  /** Identity reference, or null for implicit-identity attachments. */
  readonly identity: IdentityRef | null;
  /** Schema-prescribed column groups attached to this attachment point. */
  readonly schemaColumns: readonly SchemaColumnGroupDescriptor[];
  /** Schema-fixed category-data columns attached to this attachment point. */
  readonly categoryColumns: readonly CategoryColumnGroupDescriptor[];
  /** Attributes attached to this attachment point. */
  readonly attributes: readonly AttributeDescriptor[];
  /**
   * Sorted, de-duplicated list of attribute keys that appear more than once
   * within this attachment. Empty when the attachment is conformant. The
   * geoscience-object schema requires keys to be unique within an attribute
   * list, but the API does not enforce this.
   */
  readonly duplicateAttributeKeys: readonly string[];
  /** Envelope-level errors from resolve (malformed elements, invalid data: null states). */
  readonly envelopeErrors: readonly PerEnvelopeError[];
}

// ---- Object description (discriminated) ----

/** Description of a supported object, with its attachment points resolved. */
export interface SupportedObjectDescription {
  readonly kind: "supported";
  readonly schemaId: string;
  readonly schemaFamily: string;
  readonly attachments: readonly AttachmentDescriptor[];
  /** True when any attachment has duplicate attribute keys. */
  readonly hasDuplicateAttributeKeys: boolean;
  /** Raw JSON subtree for the properties view, if the descriptor declares one. */
  readonly propertiesData?: unknown;
}

/** Description of an unsupported object (no registered descriptor). */
export interface UnsupportedObjectDescription {
  readonly kind: "unsupported";
  readonly schemaId: string;
  readonly reason: "no-descriptor";
  readonly message: string;
}

/** Discriminated result of `describeObject`. */
export type ObjectDescription =
  | SupportedObjectDescription
  | UnsupportedObjectDescription;

// ---- Attachment table (materialised) ----

/** Selector controlling which attributes to load. Required — no default. */
export type AttributeSelector =
  | { readonly kind: "none" }
  | { readonly kind: "all" }
  | { readonly kind: "keys"; readonly keys: readonly string[] };

/** Selector controlling which schema column groups to load. Defaults to "none". */
export type SchemaColumnSelector =
  | { readonly kind: "none" }
  | { readonly kind: "all" }
  | { readonly kind: "ids"; readonly ids: readonly string[] };

/** Options for loadAttachment. */
export interface LoadAttachmentOptions {
  readonly attributes: AttributeSelector;
  /** Which schema column groups to include. Defaults to "none" if omitted. */
  readonly schemaColumns?: SchemaColumnSelector;
}

/** A materialised wide Arrow table for one attachment point. */
export interface AttachmentTable {
  /** The Apache Arrow table with identity columns first, then schema columns, then attribute columns. */
  readonly table: Table;
  /** Per-attribute errors from validation or decode failures. */
  readonly errors: readonly PerAttributeError[];
  /** Per-schema-column-group errors from validation or decode failures. */
  readonly schemaColumnErrors: readonly PerSchemaColumnGroupError[];
  /** Envelope-level errors from resolve (malformed elements, invalid data: null states). */
  readonly envelopeErrors: readonly PerEnvelopeError[];
}
