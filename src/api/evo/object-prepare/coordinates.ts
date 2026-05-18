import { float64Vector } from '@/lib/arrow';
import { buildBlob } from './blobs';
import type { PreparedBlob } from './types';

export interface CoordinatesBlobResult {
  readonly blob: PreparedBlob;
  /** xyz interleaved (length × 3). Useful for bounding-box computation. */
  readonly interleaved: Float64Array;
}

/**
 * Build a coordinates blob (`x`, `y`, `z` columns) and return both the blob
 * and an interleaved Float64Array for downstream bounding-box computation.
 *
 * @throws If any of `x`, `y`, `z` has length !== `expectedLength`.
 */
export async function buildCoordinatesBlob(
  tag: string,
  x: readonly number[],
  y: readonly number[],
  z: readonly number[],
  options: { readonly expectedLength: number },
): Promise<CoordinatesBlobResult> {
  const { expectedLength } = options;
  if (x.length !== expectedLength || y.length !== expectedLength || z.length !== expectedLength) {
    throw new RangeError(
      `buildCoordinatesBlob(${tag}): expected length ${String(expectedLength)}, got x=${String(x.length)} y=${String(y.length)} z=${String(z.length)}`,
    );
  }

  const xVec = float64Vector(x);
  const yVec = float64Vector(y);
  const zVec = float64Vector(z);

  const interleaved = new Float64Array(expectedLength * 3);
  for (let i = 0; i < expectedLength; i++) {
    interleaved[i * 3] = x[i]!;
    interleaved[i * 3 + 1] = y[i]!;
    interleaved[i * 3 + 2] = z[i]!;
  }

  const blob = await buildBlob(tag, [
    { name: 'x', vector: xVec },
    { name: 'y', vector: yVec },
    { name: 'z', vector: zVec },
  ]);

  return { blob, interleaved };
}
