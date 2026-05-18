/** Declarative descriptor for a supported geoscience-object schema family. */
export interface SchemaDescriptor {
  /** Human-readable family name, e.g. "pointset", "triangle-mesh". */
  readonly family: string;
  /** Return true if `schemaId` belongs to this family (handles minor version drift). */
  matches(schemaId: string): boolean;
  /** Attachment points this schema exposes. */
  readonly attachments: readonly AttachmentBlueprint[];
  /**
   * Compute additional attachment blueprints at runtime from the object's JSON
   * envelope. Used for polymorphic/array-valued schema structures (e.g.
   * `collections[]`, `oneOf` deviation paths) that cannot be expressed as
   * static blueprints.
   *
   * Must be pure (no I/O), must return `[]` on shape mismatch (never throw),
   * and emitted blueprint IDs must be unique across static + dynamic.
   */
  readonly dynamicAttachments?: (
    envelope: Record<string, unknown>,
  ) => AttachmentBlueprint[];
  /**
   * When set, the detail panel renders a structured tree view of the object's
   * JSON body (at the specified path, or the entire body if path is empty).
   * Composes with `attachments` — an object can have both.
   */
  readonly propertiesView?: {
    /** JSON path from body root to the subtree to display. Empty array = entire body. */
    readonly path: readonly string[];
    /** Optional label for the section header. Defaults to "Properties". */
    readonly label?: string;
  };
}

/** Blueprint for a schema-prescribed column group within an attachment. */
export interface SchemaColumnBlueprint {
  /** Unique group ID within this attachment, e.g. "lineations", "plane_orientations". */
  readonly id: string;
  /** Human-readable label for the UI chip. */
  readonly label: string;
  /** Path from the attachment node to the element JSON (like identityFrom.path). */
  readonly path: readonly string[];
  /** Canonical column names in order. */
  readonly columns: readonly string[];
}

/**
 * Blueprint for a schema-fixed category-data field (e.g. hole_id).
 * The field consists of integer codes (`values` blob) joined against a
 * lookup-table (`table` blob) to produce a Dictionary<Utf8, Int> column.
 */
export interface CategoryColumnBlueprint {
  /** Column name in the output table. */
  readonly id: string;
  /** Human-readable label for the UI chip. */
  readonly label: string;
  /** JSON path from the attachment node to the category-data object. */
  readonly path: readonly string[];
}

/** Blueprint for one attachment point within a schema. */
export interface AttachmentBlueprint {
  /** Stable identifier for this attachment, e.g. "locations", "triangles.vertices". */
  readonly id: string;
  /** Path from the object body root to the attachment node, e.g. ["locations"] or ["triangles", "vertices"]. */
  readonly jsonPath: readonly string[];
  /**
   * How to find the identity blob within the attachment node.
   * `path` is relative to the attachment node (e.g. ["coordinates"]).
   * `columns` lists the canonical column names in order (e.g. ["x", "y", "z"]).
   * Absent for implicit-identity attachments (e.g. regular-3d-grid cell_attributes).
   */
  readonly identityFrom?: {
    readonly path: readonly string[];
    readonly columns: readonly string[];
  };
  /**
   * Path from the attachment node to the attributes array.
   * Defaults to `["attributes"]` when omitted.
   */
  readonly attributesAt?: readonly string[];
  /**
   * Schema-prescribed column groups (opt-in). Each entry describes a blob
   * group that the schema defines (e.g. lineations, plane_orientations).
   */
  readonly schemaColumns?: readonly SchemaColumnBlueprint[];
  /**
   * Schema-fixed category-data fields (e.g. hole_id). Each entry describes a
   * category-data object at a known JSON path, decoded into a string column
   * via the shared category dictionary join.
   */
  readonly categoryColumns?: readonly CategoryColumnBlueprint[];
  /**
   * When true, this attachment may be absent from the envelope JSON.
   * If the jsonPath does not resolve, the attachment is silently omitted
   * from the descriptor's attachment list (no error).
   */
  readonly optional?: boolean;
}
