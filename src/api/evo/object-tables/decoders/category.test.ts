import { describe, it, expect } from "vitest";
import { tableFromArrays, makeVector, Int32, Int64 } from "apache-arrow";

import { joinCategoryDictionary } from "./category";

describe("joinCategoryDictionary — BigInt codes", () => {
  it("returns a Dictionary whose entries can be read without BigInt errors", () => {
    // int64 codes (BigInt64Array) — representative of uint64/int64 from Parquet
    const codes = makeVector({
      type: new Int64(),
      data: BigInt64Array.from([0n, 1n, 0n]),
    });

    const lookup = tableFromArrays({
      col0: BigInt64Array.from([0n, 1n]),
      col1: ["DH-001", "DH-002"],
    });

    const dict = joinCategoryDictionary(codes, lookup);

    expect(dict.length).toBe(3);
    // The actual regression: this call previously threw
    // "can't convert BigInt to number" inside Arrow's getUtf8.
    expect(dict.get(0)).toBe("DH-001");
    expect(dict.get(1)).toBe("DH-002");
    expect(dict.get(2)).toBe("DH-001");
  });

  it("works for int32 codes too (no regression in the common path)", () => {
    const codes = makeVector({
      type: new Int32(),
      data: Int32Array.from([1, 0, 1]),
    });

    const lookup = tableFromArrays({
      col0: Int32Array.from([0, 1]),
      col1: ["alpha", "beta"],
    });

    const dict = joinCategoryDictionary(codes, lookup);

    expect(dict.get(0)).toBe("beta");
    expect(dict.get(1)).toBe("alpha");
    expect(dict.get(2)).toBe("beta");
  });

  it("maps unmapped codes to null", () => {
    const codes = makeVector({
      type: new Int32(),
      data: Int32Array.from([0, 99, 1]),
    });

    const lookup = tableFromArrays({
      col0: Int32Array.from([0, 1]),
      col1: ["a", "b"],
    });

    const dict = joinCategoryDictionary(codes, lookup);

    expect(dict.get(0)).toBe("a");
    expect(dict.get(1)).toBeNull();
    expect(dict.get(2)).toBe("b");
  });
});

describe("joinCategoryDictionary — mixed integer widths (regression)", () => {
  it("joins int32 codes against an int64 lookup table", () => {
    const codes = makeVector({
      type: new Int32(),
      data: Int32Array.from([0, 1, 0, 1]),
    });

    const lookup = tableFromArrays({
      col0: BigInt64Array.from([0n, 1n]),
      col1: ["alpha", "beta"],
    });

    const dict = joinCategoryDictionary(codes, lookup);

    expect(dict.get(0)).toBe("alpha");
    expect(dict.get(1)).toBe("beta");
    expect(dict.get(2)).toBe("alpha");
    expect(dict.get(3)).toBe("beta");
  });

  it("joins int64 codes against an int32 lookup table", () => {
    const codes = makeVector({
      type: new Int64(),
      data: BigInt64Array.from([0n, 1n, 0n, 1n]),
    });

    const lookup = tableFromArrays({
      col0: Int32Array.from([0, 1]),
      col1: ["alpha", "beta"],
    });

    const dict = joinCategoryDictionary(codes, lookup);

    expect(dict.get(0)).toBe("alpha");
    expect(dict.get(1)).toBe("beta");
    expect(dict.get(2)).toBe("alpha");
    expect(dict.get(3)).toBe("beta");
  });

  it("preserves int64 values beyond Number.MAX_SAFE_INTEGER", () => {
    // Two distinct int64 keys that would collide if coerced to number.
    const a = 9007199254740993n; // 2^53 + 1
    const b = 9007199254740995n; // 2^53 + 3

    const codes = makeVector({
      type: new Int64(),
      data: BigInt64Array.from([a, b, a]),
    });

    const lookup = tableFromArrays({
      col0: BigInt64Array.from([a, b]),
      col1: ["A", "B"],
    });

    const dict = joinCategoryDictionary(codes, lookup);

    expect(dict.get(0)).toBe("A");
    expect(dict.get(1)).toBe("B");
    expect(dict.get(2)).toBe("A");
  });

  it("applies sentinel-to-null across mixed widths (int64 codes, int32 lookup)", () => {
    const codes = makeVector({
      type: new Int64(),
      data: BigInt64Array.from([0n, -1n, 1n]),
    });

    const lookup = tableFromArrays({
      col0: Int32Array.from([0, 1]),
      col1: ["a", "b"],
    });

    const dict = joinCategoryDictionary(codes, lookup, { values: [-1] });

    expect(dict.get(0)).toBe("a");
    expect(dict.get(1)).toBeNull();
    expect(dict.get(2)).toBe("b");
  });

  it("applies sentinel-to-null across mixed widths (int32 codes, int64 lookup)", () => {
    const codes = makeVector({
      type: new Int32(),
      data: Int32Array.from([0, -1, 1]),
    });

    const lookup = tableFromArrays({
      col0: BigInt64Array.from([0n, 1n]),
      col1: ["a", "b"],
    });

    const dict = joinCategoryDictionary(codes, lookup, { values: [-1] });

    expect(dict.get(0)).toBe("a");
    expect(dict.get(1)).toBeNull();
    expect(dict.get(2)).toBe("b");
  });

  it("maps unmapped codes to null across mixed widths", () => {
    const codes = makeVector({
      type: new Int32(),
      data: Int32Array.from([0, 99, 1]),
    });

    const lookup = tableFromArrays({
      col0: BigInt64Array.from([0n, 1n]),
      col1: ["a", "b"],
    });

    const dict = joinCategoryDictionary(codes, lookup);

    expect(dict.get(0)).toBe("a");
    expect(dict.get(1)).toBeNull();
    expect(dict.get(2)).toBe("b");
  });
});
