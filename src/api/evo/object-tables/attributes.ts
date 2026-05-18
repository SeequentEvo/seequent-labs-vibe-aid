/**
 * Attribute decoding — extract metadata and Arrow columns from geoscience
 * object attribute JSON.
 *
 * Two entry points:
 *  - `describeAttribute` — parse raw JSON into an `AttributeDescriptor`
 *  - `decodeAttributeColumns` — materialise Arrow columns from loaded tables
 */

import type { Table } from "apache-arrow";

import { asBlobRef, type BlobRef } from "@/api/evo/blob";

import type {
  AttributeData,
  AttributeDescriptor,
  ElementSchema,
  NanDescription,
  PerEnvelopeError,
  SupportedAttributeType,
} from "./types";
import type { DecodedColumn } from "./column-meta";
import { decodeSimple, decodeVector, decodeCategory, decodeIndices } from "./decoders";
import { synthesiseEmptyColumns } from "./empty-column";
import { validateParquetSchema } from "./validate";

// ---------------------------------------------------------------------------
// Supported attribute types
// ---------------------------------------------------------------------------

const SUPPORTED_TYPES = new Set<SupportedAttributeType>([
  "scalar",
  "category",
  "bool",
  "color",
  "string",
  "integer",
  "date_time",
  "vector",
  "indices",
]);

function isSupportedType(t: string): t is SupportedAttributeType {
  return SUPPORTED_TYPES.has(t as SupportedAttributeType);
}

// ---------------------------------------------------------------------------
// Safe property access helpers
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function str(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== "string") throw new Error(`Expected string at "${key}"`);
  return v;
}

function strOrFallback(obj: Record<string, unknown>, key: string, fallback: string): string {
  const v = obj[key];
  if (typeof v === "string") return v;
  return fallback;
}

// ---------------------------------------------------------------------------
// NaN description parsing
// ---------------------------------------------------------------------------

function parseNanDescription(raw: unknown): NanDescription | null {
  if (!isRecord(raw)) return null;
  const values = raw["values"];
  if (!Array.isArray(values)) return null;
  if (!values.every((v): v is number => typeof v === "number")) return null;
  return { values };
}

// ---------------------------------------------------------------------------
// Column names for each attribute type
// ---------------------------------------------------------------------------

function columnNames(name: string, attrType: SupportedAttributeType, raw: Record<string, unknown>): string[] {
  if (attrType === "vector") {
    const values = raw["values"];
    if (!isRecord(values)) return [name];
    const width = typeof values["width"] === "number" ? values["width"] : 1;
    return Array.from({ length: width }, (_, i) => `${name}[${String(i)}]`);
  }
  if (attrType === "category") return [name];
  return [name];
}

// ---------------------------------------------------------------------------
// Source blob extraction
// ---------------------------------------------------------------------------

/** Extract blob refs from raw attribute JSON regardless of type. */
function extractSourceBlobs(raw: Record<string, unknown>): BlobRef[] {
  const blobs: BlobRef[] = [];
  const values = raw["values"];
  if (isRecord(values) && typeof values["data"] === "string") {
    blobs.push(asBlobRef(values["data"]));
  }
  const table = raw["table"];
  if (isRecord(table) && typeof table["data"] === "string") {
    blobs.push(asBlobRef(table["data"]));
  }
  return blobs;
}

function buildAttributeData(
  attrType: SupportedAttributeType,
  raw: Record<string, unknown>,
  envelopeErrors: PerEnvelopeError[],
  name: string,
): AttributeData {
  const values = raw["values"];
  if (!isRecord(values)) return { kind: "blob", blobs: [] };

  const valuesDataIsNull = values["data"] === null;
  const valuesDataIsString = typeof values["data"] === "string";

  if (attrType === "category") {
    const table = raw["table"];
    const tableDataIsNull = isRecord(table) && table["data"] === null;
    const tableDataIsString = isRecord(table) && typeof table["data"] === "string";

    if (valuesDataIsNull && tableDataIsNull) {
      if (typeof values["length"] !== "number" || values["length"] !== 0) {
        envelopeErrors.push({
          scope: "attribute",
          id: name,
          label: name,
          message: typeof values["length"] !== "number"
            ? "attribute values.data is null but values.length is missing"
            : `attribute values.data is null but values.length is ${String(values["length"])} > 0`,
        });
        return { kind: "blob", blobs: [] };
      }
      return { kind: "empty" };
    }
    if ((valuesDataIsNull && tableDataIsString) || (valuesDataIsString && tableDataIsNull)) {
      envelopeErrors.push({
        scope: "attribute",
        id: name,
        label: name,
        message: "attribute one-sided null: values.data and table.data must both be present or both be null",
      });
      return { kind: "blob", blobs: [] };
    }
    if (valuesDataIsString && tableDataIsString) {
      const blobs = [asBlobRef(values["data"] as string)];
      if (isRecord(table)) blobs.push(asBlobRef(table["data"] as string));
      return { kind: "blob", blobs };
    }
    return { kind: "blob", blobs: [] };
  }

  if (valuesDataIsNull) {
    if (typeof values["length"] !== "number" || values["length"] !== 0) {
      envelopeErrors.push({
        scope: "attribute",
        id: name,
        label: name,
        message: typeof values["length"] !== "number"
          ? "attribute values.data is null but values.length is missing"
          : `attribute values.data is null but values.length is ${String(values["length"])} > 0`,
      });
      return { kind: "blob", blobs: [] };
    }
    return { kind: "empty" };
  }

  if (valuesDataIsString) {
    return { kind: "blob", blobs: [asBlobRef(values["data"] as string)] };
  }

  return { kind: "blob", blobs: [] };
}

// ---------------------------------------------------------------------------
// NaN description extraction for eligible types
// ---------------------------------------------------------------------------

const NAN_ELIGIBLE = new Set<SupportedAttributeType>([
  "scalar", "category", "integer", "date_time", "vector",
]);

function nanDescriptionFor(attrType: SupportedAttributeType, raw: Record<string, unknown>): NanDescription | null {
  if (!NAN_ELIGIBLE.has(attrType)) return null;
  return parseNanDescription(raw["nan_description"]);
}

// ---------------------------------------------------------------------------
// describeAttribute
// ---------------------------------------------------------------------------

/** Parse a raw attribute JSON object into an `AttributeDescriptor`. */
export function describeAttribute(raw: unknown, envelopeErrors: PerEnvelopeError[]): AttributeDescriptor {
  if (!isRecord(raw)) throw new Error("Attribute must be a non-null object");

  const name = str(raw, "name");
  const key = strOrFallback(raw, "key", name);
  const rawType = str(raw, "attribute_type");

  if (!isSupportedType(rawType)) {
    return {
      key,
      name,
      kind: { decoded: false, type: rawType },
      columns: [],
      nanDescription: null,
      attributeData: { kind: "blob", blobs: extractSourceBlobs(raw) } as AttributeData,
      elementSchema: null,
      duplicateKey: false,
    };
  }

  const values = raw["values"];
  const elementSchema: ElementSchema | null =
    isRecord(values) && typeof values["data_type"] === "string"
      ? {
          dataType: values["data_type"],
          width: typeof values["width"] === "number" ? values["width"] : 1,
        }
      : null;

  return {
    key,
    name,
    kind: { decoded: true, type: rawType },
    columns: columnNames(name, rawType, raw),
    nanDescription: nanDescriptionFor(rawType, raw),
    attributeData: buildAttributeData(rawType, raw, envelopeErrors, name),
    elementSchema,
    duplicateKey: false,
  };
}

// ---------------------------------------------------------------------------
// decodeAttributeColumns
// ---------------------------------------------------------------------------

/**
 * Materialise Arrow columns for one attribute from pre-loaded Parquet tables.
 *
 * Returns decoded columns with metadata. The caller assembles these
 * into the final wide table.
 */
export function decodeAttributeColumns(
  descriptor: AttributeDescriptor,
  tables: ReadonlyMap<BlobRef, Table>,
): DecodedColumn[] {
  const { kind, attributeData, name, key, nanDescription, elementSchema } = descriptor;

  if (!kind.decoded) return [];

  if (attributeData.kind === "empty") {
    if (!elementSchema) return [];
    return synthesiseEmptyColumns({
      elementSchema,
      columnNames: descriptor.columns,
      role: "attribute-value",
      source: key,
    });
  }

  const { blobs } = attributeData;
  if (blobs.length === 0) return [];

  const valuesBlobRef = blobs[0]!;
  const valuesTable = tables.get(valuesBlobRef);
  if (valuesTable == null) throw new Error(`Missing table for blob ${valuesBlobRef}`);

  if (elementSchema) {
    validateParquetSchema(valuesTable, elementSchema, valuesBlobRef, name);
  }

  switch (kind.type) {
    case "vector":
      return decodeVector(descriptor, valuesTable);
    case "category":
      return decodeCategory(descriptor, valuesTable, tables);
    case "indices":
      return decodeIndices(descriptor, valuesTable);
    default:
      return decodeSimple(name, key, valuesBlobRef, nanDescription, kind.type, valuesTable);
  }
}
