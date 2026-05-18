import { describe, expect, it } from "vitest";
import { synthesiseEmptyColumns, dataTypeToArrowType } from "./empty-column";
import { Float64, Int32, Int64, Uint32, Uint64, Utf8, Bool, Timestamp } from "apache-arrow";
import { wasNoData } from "./column-meta";
import { Field } from "apache-arrow";

describe("dataTypeToArrowType", () => {
  it.each([
    ["float64", Float64],
    ["int32", Int32],
    ["int64", Int64],
    ["uint32", Uint32],
    ["uint64", Uint64],
    ["string", Utf8],
    ["bool", Bool],
    ["timestamp", Timestamp],
  ])("maps %s to the correct Arrow type class", (dataType, expectedClass) => {
    const arrowType = dataTypeToArrowType(dataType);
    expect(arrowType).toBeInstanceOf(expectedClass);
  });

  it("throws for unknown data_type", () => {
    expect(() => dataTypeToArrowType("unknown_type")).toThrow(/Unknown data_type/);
  });
});

describe("synthesiseEmptyColumns", () => {
  it("produces 0-row columns with correct names", () => {
    const cols = synthesiseEmptyColumns({
      elementSchema: { dataType: "float64", width: 3 },
      columnNames: ["x", "y", "z"],
      role: "identity",
      source: "test-identity",
    });
    expect(cols).toHaveLength(3);
    expect(cols.map(c => c.name)).toEqual(["x", "y", "z"]);
    cols.forEach(col => {
      expect(col.data.length).toBe(0);
    });
  });

  it("stamps evo:noData=true in metadata", () => {
    const cols = synthesiseEmptyColumns({
      elementSchema: { dataType: "int32", width: 1 },
      columnNames: ["value"],
      role: "schema-column",
      source: "test-group",
      schemaColumnGroupId: "test-group",
    });
    expect(cols).toHaveLength(1);
    const field = new Field(cols[0]!.name, cols[0]!.data.type, true, cols[0]!.metadata);
    expect(wasNoData(field)).toBe(true);
  });

  it("produces columns for each supported data type", () => {
    for (const dt of ["float64", "int32", "int64", "uint32", "uint64", "timestamp", "string", "bool"]) {
      const cols = synthesiseEmptyColumns({
        elementSchema: { dataType: dt, width: 1 },
        columnNames: ["col"],
        role: "attribute-value",
        source: "test",
      });
      expect(cols).toHaveLength(1);
      expect(cols[0]!.data.length).toBe(0);
    }
  });
});
