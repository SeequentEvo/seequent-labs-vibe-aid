import {
  buildCoordinatesBlob,
  buildAttributeBlobs,
} from '@/api/evo/object-prepare';
import type {
  PreparedBlob,
  PreparedAttribute,
  PrepareAttributeInput,
} from '@/api/evo/object-prepare';

export type { PreparedBlob, PreparedAttribute } from '@/api/evo/object-prepare';

/** Typed input for a pointset upload. */
export interface PointsetInput {
  readonly x: readonly number[];
  readonly y: readonly number[];
  readonly z: readonly number[];
  readonly attributes: readonly PrepareAttributeInput[];
}

/** Result of prepare-for-upload. */
export interface PrepareResult {
  readonly blobs: readonly PreparedBlob[];
  readonly coordinates: Float64Array;
  readonly length: number;
  readonly attributes: readonly PreparedAttribute[];
}

/**
 * Transform typed column data into tagged parquet tables and metadata.
 *
 * Produces:
 * - 1 blob tagged "coordinates" (float64, columns x/y/z)
 * - Per scalar/integer/string attribute: 1 blob tagged "<key>.values"
 * - Per category attribute: 2 blobs — "<key>.values" (int32 codes) and "<key>.lookup"
 */
export async function prepareForUpload(
  input: PointsetInput,
): Promise<PrepareResult> {
  const length = input.x.length;

  const coords = await buildCoordinatesBlob('coordinates', input.x, input.y, input.z, {
    expectedLength: length,
  });

  const attrResult = await buildAttributeBlobs(input.attributes, {
    expectedLength: length,
  });

  return {
    blobs: [coords.blob, ...attrResult.blobs],
    coordinates: coords.interleaved,
    length,
    attributes: attrResult.attributes,
  };
}
