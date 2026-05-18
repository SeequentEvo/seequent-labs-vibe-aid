import { describe, expect, it } from "vitest";
import { Float64, makeBuilder, Utf8 } from "apache-arrow";
import type { Vector } from "apache-arrow";

import {
  decodeParquet,
  encodeParquet,
} from "@/api/evo/blob/parquetCodec";

import { arrowToParquetTable, buildArrowTable } from "./tables";
import type { NamedColumn } from "./tables";

/** Helper: build a Float64 vector from values (null encodes as null). */
function float64Vector(values: (number | null)[]): Vector {
  const builder = makeBuilder({ type: new Float64(), nullValues: [null] });
  for (const v of values) {
    builder.append(v);
  }
  return builder.finish().toVector();
}

/** Helper: build a Utf8 vector from values. */
function utf8Vector(values: (string | null)[]): Vector {
  const builder = makeBuilder({ type: new Utf8(), nullValues: [null] });
  for (const v of values) {
    builder.append(v);
  }
  return builder.finish().toVector();
}

describe("buildArrowTable", () => {
  it("preserves column types", () => {
    const columns: NamedColumn[] = [
      { name: "value", vector: float64Vector([1.0, 2.0, 3.0]) },
      { name: "label", vector: utf8Vector(["a", "b", "c"]) },
    ];
    const table = buildArrowTable(columns);

    expect(table.numRows).toBe(3);
    expect(table.schema.fields).toHaveLength(2);
    expect(table.schema.fields[0]!.name).toBe("value");
    expect(table.schema.fields[0]!.type.toString()).toBe("Float64");
    expect(table.schema.fields[1]!.name).toBe("label");
    expect(table.schema.fields[1]!.type.toString()).toBe("Utf8");
  });

  it("preserves nulls in the validity bitmap", () => {
    const vec = float64Vector([1.0, null, 3.0]);
    const table = buildArrowTable([{ name: "x", vector: vec }]);

    const col = table.getChild("x")!;
    expect(col.isValid(0)).toBe(true);
    expect(col.isValid(1)).toBe(false);
    expect(col.get(1)).toBeNull();
    expect(col.isValid(2)).toBe(true);
    expect(col.get(2)).toBe(3.0);
  });

  it("handles multiple columns", () => {
    const columns: NamedColumn[] = [
      { name: "a", vector: float64Vector([1.0]) },
      { name: "b", vector: utf8Vector(["hello"]) },
      { name: "c", vector: float64Vector([42.0]) },
    ];
    const table = buildArrowTable(columns);

    expect(table.schema.fields).toHaveLength(3);
    expect(table.schema.fields.map((f) => f.name)).toEqual(["a", "b", "c"]);
    expect(table.numRows).toBe(1);
  });
});

describe("arrowToParquetTable", () => {
  it("round-trips nullable Float64 through parquet", async () => {
    const vec = float64Vector([10.0, null, 30.0]);
    const arrowTable = buildArrowTable([{ name: "val", vector: vec }]);
    const parquetTable = await arrowToParquetTable(arrowTable);

    // Encode → decode round-trip to verify nulls survive parquet serialisation
    const bytes = await encodeParquet(parquetTable);
    const decoded = await decodeParquet(bytes);
    const ipc = decoded.intoIPCStream();

    const { tableFromIPC } = await import("apache-arrow");
    const result = tableFromIPC(ipc);

    const col = result.getChild("val")!;
    expect(col.get(0)).toBe(10.0);
    expect(col.isValid(1)).toBe(false);
    expect(col.get(1)).toBeNull();
    expect(col.get(2)).toBe(30.0);
  });
});
