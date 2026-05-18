import { describe, it, expect } from "vitest";
import { Float64, Vector, makeData } from "apache-arrow";

import { applyNullMask, buildNullMask } from "./null-mask";

function makeFloat64Chunk(values: number[]) {
  return makeData({
    type: new Float64(),
    length: values.length,
    data: new Float64Array(values),
  });
}

describe("applyNullMask", () => {
  it("applies a null mask across multiple chunks", () => {
    const chunk1 = makeFloat64Chunk([1, 2, 3]);
    const chunk2 = makeFloat64Chunk([4, 5, 6, 7]);
    const vector = new Vector([chunk1, chunk2]);

    // Row indices: 0..6. Mark indices 1 (chunk0) and 4, 6 (chunk1) as null.
    const bitmap = new Uint8Array(1);
    bitmap.fill(0xff);
    for (const i of [1, 4, 6]) {
      bitmap[i >> 3]! &= ~(1 << (i & 7));
    }

    const result = applyNullMask(vector, bitmap);

    expect(result.length).toBe(7);
    expect(result.nullCount).toBe(3);
    expect(result.get(0)).toBe(1);
    expect(result.get(1)).toBeNull();
    expect(result.get(2)).toBe(3);
    expect(result.get(3)).toBe(4);
    expect(result.get(4)).toBeNull();
    expect(result.get(5)).toBe(6);
    expect(result.get(6)).toBeNull();
  });

  it("merges with each chunk's pre-existing validity bitmap", () => {
    // Pre-mark index 0 of chunk0 as null via an existing validity bitmap.
    const existingBitmap = new Uint8Array([0b00000110]); // bit 0 = null
    const chunk1 = makeData({
      type: new Float64(),
      length: 3,
      nullCount: 1,
      nullBitmap: existingBitmap,
      data: new Float64Array([10, 20, 30]),
    });
    const chunk2 = makeFloat64Chunk([40, 50]);
    const vector = new Vector([chunk1, chunk2]);

    // Source mask marks index 3 (chunk1, local 0) as null; leaves rest valid.
    const bitmap = new Uint8Array(1);
    bitmap.fill(0xff);
    bitmap[0]! &= ~(1 << 3);

    const result = applyNullMask(vector, bitmap);

    expect(result.nullCount).toBe(2);
    expect(result.get(0)).toBeNull(); // from chunk's existing validity
    expect(result.get(1)).toBe(20);
    expect(result.get(2)).toBe(30);
    expect(result.get(3)).toBeNull(); // from source mask
    expect(result.get(4)).toBe(50);
  });
});

describe("buildNullMask", () => {
  it("returns null when nothing matches", () => {
    const v = new Vector([makeFloat64Chunk([1, 2, 3])]);
    expect(buildNullMask(v, new Set(), true)).toBeNull();
  });

  it("clears bits for NaN and sentinel values", () => {
    const v = new Vector([makeFloat64Chunk([1, NaN, -9999, 4])]);
    const mask = buildNullMask(v, new Set([-9999]), true);
    expect(mask).not.toBeNull();
    const bits = mask!;
    expect((bits[0]! >> 0) & 1).toBe(1);
    expect((bits[0]! >> 1) & 1).toBe(0); // NaN
    expect((bits[0]! >> 2) & 1).toBe(0); // sentinel
    expect((bits[0]! >> 3) & 1).toBe(1);
  });
});
