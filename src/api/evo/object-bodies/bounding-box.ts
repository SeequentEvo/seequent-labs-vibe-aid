/** Bounding box for the pointset schema (base-spatial-data-properties). */
export interface BoundingBox {
  readonly min_x: number;
  readonly max_x: number;
  readonly min_y: number;
  readonly max_y: number;
  readonly min_z: number;
  readonly max_z: number;
}

/**
 * Compute a tight axis-aligned bounding box from interleaved XYZ coordinates.
 *
 * @param coords - Float64Array of interleaved [x0,y0,z0, x1,y1,z1, ...] values.
 *                 Length must be a multiple of 3 and >= 3.
 * @throws If coords is empty or length is not a multiple of 3.
 */
export function boundingBoxFromXYZ(coords: Float64Array): BoundingBox {
  if (coords.length === 0) {
    throw new Error('Cannot compute bounding box from empty coordinates');
  }
  if (coords.length % 3 !== 0) {
    throw new Error('Coordinate array length must be a multiple of 3');
  }

  let min_x = coords[0]!;
  let max_x = coords[0]!;
  let min_y = coords[1]!;
  let max_y = coords[1]!;
  let min_z = coords[2]!;
  let max_z = coords[2]!;

  for (let i = 3; i < coords.length; i += 3) {
    const x = coords[i]!;
    const y = coords[i + 1]!;
    const z = coords[i + 2]!;

    if (x < min_x) min_x = x;
    if (x > max_x) max_x = x;
    if (y < min_y) min_y = y;
    if (y > max_y) max_y = y;
    if (z < min_z) min_z = z;
    if (z > max_z) max_z = z;
  }

  return { min_x, max_x, min_y, max_y, min_z, max_z };
}
