import { float64Vector } from '@/lib/arrow';
import {
  buildBlob,
  buildCoordinatesBlob,
  buildCategoryBlobs,
  buildAttributeBlobs,
  type PreparedBlob,
  type PreparedAttribute,
  type PrepareAttributeInput,
} from '@/api/evo/object-prepare';

export type { PreparedBlob, PreparedAttribute };

/** Typed input for downhole-intervals preparation. */
export interface IntervalsInput {
  readonly holeId: readonly string[];
  readonly from: readonly number[];
  readonly to: readonly number[];
  readonly startX: readonly number[];
  readonly startY: readonly number[];
  readonly startZ: readonly number[];
  readonly endX: readonly number[];
  readonly endY: readonly number[];
  readonly endZ: readonly number[];
  readonly midX: readonly number[];
  readonly midY: readonly number[];
  readonly midZ: readonly number[];
  readonly attributes: readonly PrepareAttributeInput[];
}

/** Result of preparing downhole-intervals for upload. */
export interface IntervalsPrepareResult {
  readonly blobs: readonly PreparedBlob[];
  /** All coordinates (start+end+mid interleaved) for bounding box. */
  readonly allCoordinates: Float64Array;
  readonly length: number;
  readonly attributes: readonly PreparedAttribute[];
  /** Number of distinct hole IDs (needed by the body builder). */
  readonly holeIdLookupLength: number;
}

/**
 * Transform typed interval data into tagged parquet tables and metadata.
 *
 * Produces, in order:
 * - "start_coordinates", "end_coordinates", "mid_coordinates" (float64 × 3)
 * - "from_to" (float64 × 2)
 * - "hole_id.values", "hole_id.lookup"
 * - Per attribute: "<uuid>.values" (+ "<uuid>.lookup" for category)
 */
export async function prepareIntervalsForUpload(
  input: IntervalsInput,
): Promise<IntervalsPrepareResult> {
  const length = input.holeId.length;

  const start = await buildCoordinatesBlob(
    'start_coordinates',
    input.startX,
    input.startY,
    input.startZ,
    { expectedLength: length },
  );
  const end = await buildCoordinatesBlob(
    'end_coordinates',
    input.endX,
    input.endY,
    input.endZ,
    { expectedLength: length },
  );
  const mid = await buildCoordinatesBlob(
    'mid_coordinates',
    input.midX,
    input.midY,
    input.midZ,
    { expectedLength: length },
  );

  const fromTo = await buildBlob('from_to', [
    { name: 'from', vector: float64Vector(input.from) },
    { name: 'to', vector: float64Vector(input.to) },
  ]);

  const holeId = await buildCategoryBlobs('hole_id', input.holeId, {
    expectedLength: length,
  });

  const attrs = await buildAttributeBlobs(input.attributes, {
    expectedLength: length,
  });

  const allCoordinates = new Float64Array(length * 9);
  for (let i = 0; i < length; i++) {
    const base = i * 9;
    allCoordinates[base] = start.interleaved[i * 3]!;
    allCoordinates[base + 1] = start.interleaved[i * 3 + 1]!;
    allCoordinates[base + 2] = start.interleaved[i * 3 + 2]!;
    allCoordinates[base + 3] = end.interleaved[i * 3]!;
    allCoordinates[base + 4] = end.interleaved[i * 3 + 1]!;
    allCoordinates[base + 5] = end.interleaved[i * 3 + 2]!;
    allCoordinates[base + 6] = mid.interleaved[i * 3]!;
    allCoordinates[base + 7] = mid.interleaved[i * 3 + 1]!;
    allCoordinates[base + 8] = mid.interleaved[i * 3 + 2]!;
  }

  const blobs: PreparedBlob[] = [
    start.blob,
    end.blob,
    mid.blob,
    fromTo,
    ...holeId.blobs,
    ...attrs.blobs,
  ];

  return {
    blobs,
    allCoordinates,
    length,
    attributes: attrs.attributes,
    holeIdLookupLength: holeId.lookupLength,
  };
}
