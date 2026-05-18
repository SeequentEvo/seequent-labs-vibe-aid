/** Wire shape for CRS in the object body. */
export type CrsWire = "unspecified" | { readonly epsg_code: number };

/** Input shape from the UI. */
export type CrsInput = "unspecified" | { readonly epsgCode: number };

/**
 * Normalise a CRS input to the wire shape.
 *
 * Validates that EPSG codes are integers in the range 1024..32767.
 * @throws On invalid EPSG codes.
 */
export function normaliseCrs(input: CrsInput): CrsWire {
  if (input === "unspecified") return "unspecified";

  const { epsgCode } = input;

  if (!Number.isInteger(epsgCode)) {
    throw new RangeError(`EPSG code must be a finite integer, got ${String(epsgCode)}`);
  }

  if (epsgCode < 1024 || epsgCode > 32767) {
    throw new RangeError(
      `EPSG code must be in range 1024..32767, got ${String(epsgCode)}`,
    );
  }

  return { epsg_code: epsgCode };
}
