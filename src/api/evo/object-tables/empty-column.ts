import {
  Bool,
  Float64,
  Int32,
  Int64,
  Uint32,
  Uint64,
  TimestampMillisecond,
  Utf8,
  makeData,
  makeVector,
  type DataType,
} from "apache-arrow";

import type { ElementSchema } from "./types";
import { buildColumnMetadata, type ColumnRole, type DecodedColumn } from "./column-meta";

export function dataTypeToArrowType(dataType: string): DataType {
  switch (dataType) {
    case "float64":
      return new Float64();
    case "int32":
      return new Int32();
    case "int64":
      return new Int64();
    case "uint32":
      return new Uint32();
    case "uint64":
      return new Uint64();
    case "timestamp":
      return new TimestampMillisecond();
    case "string":
      return new Utf8();
    case "bool":
      return new Bool();
    default:
      throw new Error(`Unknown data_type "${dataType}" — cannot synthesise empty column`);
  }
}

export function synthesiseEmptyColumns(params: {
  elementSchema: ElementSchema;
  columnNames: readonly string[];
  role: ColumnRole;
  source: string;
  schemaColumnGroupId?: string;
}): DecodedColumn[] {
  const { elementSchema, columnNames, role, source, schemaColumnGroupId } = params;
  const arrowType = dataTypeToArrowType(elementSchema.dataType);

  return columnNames.map((name) => ({
    name,
    data: makeVector([makeData({ type: arrowType, length: 0 })]),
    metadata: buildColumnMetadata({ role, source, blobRef: "", noData: true, schemaColumnGroupId }),
  }));
}
