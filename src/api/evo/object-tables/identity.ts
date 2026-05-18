import { type Table, Int32, Utf8, Dictionary, makeData, makeVector } from "apache-arrow";

import { asBlobRef } from "@/api/evo/blob";

import type { CategoryColumnGroupDescriptor, IdentityRef, PerEnvelopeError, SchemaColumnGroupDescriptor } from "./types";
import type { AttachmentBlueprint } from "./schemas/types";
import { buildColumnMetadata, type DecodedColumn } from "./column-meta";
import { validateParquetSchema } from "./validate";
import { joinCategoryDictionary } from "./decoders";
import { synthesiseEmptyColumns } from "./empty-column";

/**
 * Walk an unknown object by a sequence of string keys,
 * returning `undefined` if any step is missing or non-object.
 */
function walkPath(root: unknown, path: readonly string[]): unknown {
  let node: unknown = root;
  for (const key of path) {
    if (node == null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

/**
 * Extract an {@link IdentityRef} from an attachment node using the blueprint's
 * `identityFrom` descriptor. Returns `null` for implicit-identity attachments
 * or when the element is absent. Pushes to `envelopeErrors` for malformed elements.
 */
export function resolveIdentity(
  attachmentNode: unknown,
  blueprint: AttachmentBlueprint,
  envelopeErrors: PerEnvelopeError[],
): IdentityRef | null {
  if (!blueprint.identityFrom) return null;

  const element = walkPath(attachmentNode, blueprint.identityFrom.path);
  if (element == null || typeof element !== "object") return null;

  const rec = element as Record<string, unknown>;
  const errorId = blueprint.identityFrom.path.join(".");
  const pushError = (message: string): null => {
    envelopeErrors.push({ scope: "identity", id: errorId, label: "identity", message });
    return null;
  };

  if (rec.data === null) {
    if (typeof rec.length !== "number")
      return pushError("data is null but length is missing");
    if (rec.length !== 0)
      return pushError(`data is null with length ${String(rec.length)} > 0`);
    if (typeof rec.width !== "number" || typeof rec.data_type !== "string")
      return pushError("data is null with length 0 but width or data_type is missing");
    return {
      kind: "empty",
      rowCount: 0,
      columns: blueprint.identityFrom.columns,
      elementSchema: { dataType: rec.data_type, width: rec.width },
    };
  }

  if (typeof rec.data !== "string")
    return pushError(`data has unexpected type ${typeof rec.data}`);
  if (typeof rec.length !== "number")
    return pushError("length is missing");

  const width = typeof rec.width === "number" ? rec.width : blueprint.identityFrom.columns.length;
  const dataType = typeof rec.data_type === "string" ? rec.data_type : "float64";

  return {
    kind: "blob",
    blobRef: asBlobRef(rec.data),
    rowCount: rec.length,
    columns: blueprint.identityFrom.columns,
    elementSchema: { dataType, width },
  };
}

/**
 * Decode identity columns from an already-parsed Arrow table.
 * Columns are extracted by index (Parquet column names are unreliable).
 */
export function decodeIdentityColumns(
  identity: IdentityRef,
  table: Table,
): DecodedColumn[] {
  if (identity.kind !== "blob") {
    return synthesiseEmptyColumns({
      elementSchema: identity.elementSchema,
      columnNames: identity.columns,
      role: "identity",
      source: "identity",
    });
  }

  validateParquetSchema(table, identity.elementSchema, identity.blobRef, "identity");

  const result: DecodedColumn[] = [];

  for (let i = 0; i < identity.columns.length; i++) {
    const child = table.getChildAt(i);
    if (child == null) {
      throw new Error(
        `Data integrity error: identity blob ${identity.blobRef} reported ` +
        `width ${String(identity.elementSchema.width)} but column ${String(i)} ` +
        `is absent. This violates the schema/blob contract.`,
      );
    }
    result.push({
      name: identity.columns[i]!,
      data: child,
      metadata: buildColumnMetadata({
        role: "identity",
        source: "identity",
        blobRef: identity.blobRef,
      }),
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Schema column groups — resolve + decode
// ---------------------------------------------------------------------------

/**
 * Resolve schema-prescribed column groups from an attachment node.
 * Walks each `schemaColumns[i].path`, extracts `data`, `length`, `width`, `data_type`.
 * Pushes to `envelopeErrors` for malformed elements.
 */
export function resolveSchemaColumns(
  attachmentNode: unknown,
  blueprint: AttachmentBlueprint,
  envelopeErrors: PerEnvelopeError[],
): SchemaColumnGroupDescriptor[] {
  if (!blueprint.schemaColumns || blueprint.schemaColumns.length === 0) return [];

  const result: SchemaColumnGroupDescriptor[] = [];

  for (const group of blueprint.schemaColumns) {
    const element = walkPath(attachmentNode, group.path);
    if (element == null || typeof element !== "object") continue;

    const rec = element as Record<string, unknown>;
    const pushError = (message: string): void => {
      envelopeErrors.push({ scope: "schemaColumnGroup", id: group.id, label: group.label, message });
    };

    if (rec.data === null) {
      if (typeof rec.length !== "number") {
        pushError("data is null but length is missing");
        continue;
      }
      if (rec.length !== 0) {
        pushError(`data is null with length ${String(rec.length)} > 0`);
        continue;
      }
      if (typeof rec.width !== "number" || typeof rec.data_type !== "string") {
        pushError("data is null with length 0 but width or data_type is missing");
        continue;
      }
      result.push({
        kind: "empty",
        id: group.id,
        label: group.label,
        columns: group.columns,
        rowCount: 0,
        elementSchema: { dataType: rec.data_type, width: rec.width },
      });
      continue;
    }

    if (typeof rec.data !== "string") {
      pushError(`data has unexpected type ${typeof rec.data}`);
      continue;
    }
    if (typeof rec.length !== "number") {
      pushError("length is missing");
      continue;
    }

    const width = typeof rec.width === "number" ? rec.width : group.columns.length;
    const dataType = typeof rec.data_type === "string" ? rec.data_type : "float64";

    result.push({
      kind: "blob",
      id: group.id,
      label: group.label,
      columns: group.columns,
      blobRef: asBlobRef(rec.data),
      rowCount: rec.length,
      elementSchema: { dataType, width },
    });
  }

  return result;
}

/**
 * Decode a single schema column group from an already-parsed Arrow table.
 * Validates with `validateParquetSchema`, then extracts columns by index
 * with role `"schema-column"` and the group ID in metadata.
 */
export function decodeSchemaColumnGroup(
  group: SchemaColumnGroupDescriptor,
  table: Table,
): DecodedColumn[] {
  if (group.kind !== "blob") {
    return synthesiseEmptyColumns({
      elementSchema: group.elementSchema,
      columnNames: group.columns,
      role: "schema-column",
      source: group.id,
      schemaColumnGroupId: group.id,
    });
  }

  validateParquetSchema(table, group.elementSchema, group.blobRef, group.label);

  const result: DecodedColumn[] = [];

  for (let i = 0; i < group.columns.length; i++) {
    const child = table.getChildAt(i);
    if (child == null) {
      throw new Error(
        `Data integrity error: schema column group "${group.id}" blob ` +
        `${group.blobRef} reported width ${String(group.elementSchema.width)} ` +
        `but column ${String(i)} is absent. This violates the schema/blob contract.`,
      );
    }
    result.push({
      name: group.columns[i]!,
      data: child,
      metadata: buildColumnMetadata({
        role: "schema-column",
        source: group.id,
        blobRef: group.blobRef,
        schemaColumnGroupId: group.id,
      }),
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Category column groups — resolve + decode
// ---------------------------------------------------------------------------

/**
 * Resolve schema-fixed category-data fields from an attachment node.
 * Each blueprint path points to a `{ values: { data, length }, table: { data } }` object.
 * Pushes to `envelopeErrors` for malformed elements.
 */
export function resolveCategoryColumns(
  attachmentNode: unknown,
  blueprint: AttachmentBlueprint,
  envelopeErrors: PerEnvelopeError[],
): CategoryColumnGroupDescriptor[] {
  if (!blueprint.categoryColumns || blueprint.categoryColumns.length === 0) return [];

  const result: CategoryColumnGroupDescriptor[] = [];

  for (const col of blueprint.categoryColumns) {
    const node = walkPath(attachmentNode, col.path);
    if (node == null || typeof node !== "object") continue;

    const rec = node as Record<string, unknown>;
    const values = rec["values"];
    const table = rec["table"];
    if (!values || typeof values !== "object" || !table || typeof table !== "object") continue;

    const valuesRec = values as Record<string, unknown>;
    const tableRec = table as Record<string, unknown>;

    const pushError = (message: string): void => {
      envelopeErrors.push({ scope: "categoryColumn", id: col.id, label: col.label, message });
    };

    const valuesDataIsNull = valuesRec["data"] === null;
    const tableDataIsNull = tableRec["data"] === null;
    const valuesDataIsString = typeof valuesRec["data"] === "string";
    const tableDataIsString = typeof tableRec["data"] === "string";

    if (valuesDataIsString && tableDataIsString) {
      if (typeof valuesRec["length"] !== "number") {
        pushError("values.data is present but values.length is missing");
        continue;
      }
      result.push({
        kind: "blob",
        id: col.id,
        label: col.label,
        codesBlobRef: asBlobRef(valuesRec["data"] as string),
        lookupBlobRef: asBlobRef(tableRec["data"] as string),
        rowCount: valuesRec["length"] as number,
      });
      continue;
    }

    if (valuesDataIsNull && tableDataIsNull) {
      if (typeof valuesRec["length"] !== "number" || valuesRec["length"] !== 0) {
        pushError(
          typeof valuesRec["length"] !== "number"
            ? "both data fields are null but values.length is missing"
            : `both data fields are null but values.length is ${String(valuesRec["length"])} > 0`,
        );
        continue;
      }
      result.push({
        kind: "empty",
        id: col.id,
        label: col.label,
        rowCount: 0,
      });
      continue;
    }

    if ((valuesDataIsNull && tableDataIsString) || (valuesDataIsString && tableDataIsNull)) {
      pushError("one-sided null: values.data and table.data must both be present or both be null");
      continue;
    }

    pushError(`unexpected data types: values.data is ${typeof valuesRec["data"]}, table.data is ${typeof tableRec["data"]}`);
  }

  return result;
}

/**
 * Decode a single category-data column from pre-loaded Arrow tables.
 * Uses the shared `joinCategoryDictionary` core from the category decoder.
 */
export function decodeCategoryColumn(
  descriptor: CategoryColumnGroupDescriptor,
  codesTable: Table,
  lookupTable: Table,
): DecodedColumn[] {
  if (descriptor.kind !== "blob") {
    const dictType = new Dictionary(new Utf8(), new Int32());
    const emptyDict = makeVector([makeData({
      type: dictType,
      length: 0,
      nullCount: 0,
    })]);
    return [{
      name: descriptor.id,
      data: emptyDict,
      metadata: buildColumnMetadata({
        role: "schema-column",
        source: descriptor.id,
        blobRef: "",
        noData: true,
        schemaColumnGroupId: descriptor.id,
      }),
    }];
  }

  const codesVector = codesTable.getChildAt(0);
  if (!codesVector) throw new Error(`Empty codes table for category column "${descriptor.id}"`);

  const dictVector = joinCategoryDictionary(codesVector, lookupTable);

  return [{
    name: descriptor.id,
    data: dictVector,
    metadata: buildColumnMetadata({
      role: "schema-column",
      source: descriptor.id,
      blobRef: descriptor.codesBlobRef,
      schemaColumnGroupId: descriptor.id,
    }),
  }];
}
