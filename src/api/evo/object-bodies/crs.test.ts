import { describe, expect, it } from "vitest";

import { normaliseCrs } from "./crs";

describe("normaliseCrs", () => {
  it('passes "unspecified" through unchanged', () => {
    expect(normaliseCrs("unspecified")).toBe("unspecified");
  });

  it("converts a valid EPSG code to wire format", () => {
    expect(normaliseCrs({ epsgCode: 4326 })).toEqual({ epsg_code: 4326 });
  });

  it("accepts the lower bound (1024)", () => {
    expect(normaliseCrs({ epsgCode: 1024 })).toEqual({ epsg_code: 1024 });
  });

  it("accepts the upper bound (32767)", () => {
    expect(normaliseCrs({ epsgCode: 32767 })).toEqual({ epsg_code: 32767 });
  });

  it("rejects codes below the lower bound", () => {
    expect(() => normaliseCrs({ epsgCode: 1023 })).toThrow(RangeError);
  });

  it("rejects codes above the upper bound", () => {
    expect(() => normaliseCrs({ epsgCode: 32768 })).toThrow(RangeError);
  });

  it("rejects non-integer codes", () => {
    expect(() => normaliseCrs({ epsgCode: 4326.5 })).toThrow(RangeError);
  });

  it("rejects NaN", () => {
    expect(() => normaliseCrs({ epsgCode: NaN })).toThrow(RangeError);
  });

  it("rejects Infinity", () => {
    expect(() => normaliseCrs({ epsgCode: Infinity })).toThrow(RangeError);
  });
});
