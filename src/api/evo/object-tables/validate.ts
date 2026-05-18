/**
 * Parquet schema validation — verify that an Arrow table's schema matches
 * what the object JSON declares before decoding.
 */

import { Bool, Float, Int, Timestamp, Utf8, type DataType, type Table } from "apache-arrow";

import type { ElementSchema } from "./types";

/**
 * Maps element JSON `data_type` strings to Arrow DataType validation
 * functions. Each validator receives the field's DataType and returns
 * true when the Arrow type matches the declared JSON type.
 *
 * Discrimination uses Arrow's exported type classes (`instanceof`) rather
 * than raw `typeId` checks: this keeps each validator's property accesses
 * (`precision`, `bitWidth`, `isSigned`) properly typed without casts.
 */
const TYPE_VALIDATORS: Record<string, (dt: DataType) => boolean> = {
  float64:   (dt) => dt instanceof Float && dt.precision === 2,
  int32:     (dt) => dt instanceof Int && dt.bitWidth === 32 && dt.isSigned,
  int64:     (dt) => dt instanceof Int && dt.bitWidth === 64 && dt.isSigned,
  uint32:    (dt) => dt instanceof Int && dt.bitWidth === 32 && !dt.isSigned,
  uint64:    (dt) => dt instanceof Int && dt.bitWidth === 64 && !dt.isSigned,
  timestamp: (dt) => dt instanceof Timestamp,
  string:    (dt) => dt instanceof Utf8,
  bool:      (dt) => dt instanceof Bool,
};

function describeArrowType(dt: DataType): string {
  if (dt instanceof Float) {
    if (dt.precision === 0) return "float16";
    if (dt.precision === 1) return "float32";
    return "float64";
  }
  if (dt instanceof Int) {
    return `${dt.isSigned ? "int" : "uint"}${String(dt.bitWidth)}`;
  }
  if (dt instanceof Utf8) return "string";
  if (dt instanceof Bool) return "bool";
  if (dt instanceof Timestamp) return "timestamp";
  return `unknown(typeId=${String(dt.typeId)})`;
}

/**
 * Validate that an Arrow table's schema matches the declared element schema.
 * Throws a descriptive error on mismatch.
 *
 * @param table     The Arrow table decoded from a Parquet blob
 * @param schema    The expected schema from the object JSON element
 * @param blobRef   Blob reference for error messages
 * @param attrName  Attribute name for error messages
 */
export function validateParquetSchema(
  table: Table,
  schema: ElementSchema,
  blobRef: string,
  attrName: string,
): void {
  const actualCols = table.schema.fields.length;
  if (actualCols !== schema.width) {
    throw new Error(
      `Data integrity error: attribute '${attrName}' declares width ${String(schema.width)} ` +
      `but the Parquet blob ${blobRef} contains ${String(actualCols)} column(s). ` +
      `This indicates the object's data blobs do not match its JSON schema — ` +
      `the data may be corrupt or was produced by a non-conforming writer.`,
    );
  }

  // Composite dtype — slash-separated per-column types (e.g. "int32/uint64/uint64")
  const perColumnTypes = schema.dataType.split("/");
  const isComposite = perColumnTypes.length > 1;

  if (isComposite && perColumnTypes.length !== actualCols) {
    throw new Error(
      `Data integrity error: attribute '${attrName}' declares composite data_type '${schema.dataType}' ` +
      `with ${String(perColumnTypes.length)} types but the Parquet blob ${blobRef} contains ${String(actualCols)} column(s).`,
    );
  }

  for (let i = 0; i < actualCols; i++) {
    const expectedType = isComposite ? perColumnTypes[i]! : schema.dataType;
    const validator = TYPE_VALIDATORS[expectedType];
    if (!validator) continue;

    const field = table.schema.fields[i]!;
    const dt = field.type;

    if (!validator(dt)) {
      const actual = describeArrowType(dt);
      throw new Error(
        `Data integrity error: attribute '${attrName}' declares data_type '${expectedType}' ` +
        `but column ${String(i)} of Parquet blob ${blobRef} contains '${actual}'. ` +
        `This indicates the object's data blobs do not match its JSON schema — ` +
        `the data may be corrupt or was produced by a non-conforming writer.`,
      );
    }
  }
}
