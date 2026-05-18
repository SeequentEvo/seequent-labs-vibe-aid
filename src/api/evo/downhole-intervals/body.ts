import type { BlobRef } from '@/api/evo/blob';
import type { CrsInput } from '@/api/evo/object-bodies';
import {
  baseSpatialProperties,
  boundingBoxFromXYZ,
  normaliseCrs,
  floatArrayElement,
  fromToComponent,
  categoryDataComponent,
  attributeEntry,
} from '@/api/evo/object-bodies';
import type { PreparedAttribute } from '@/api/evo/object-prepare';

const DOWNHOLE_INTERVALS_SCHEMA =
  '/objects/downhole-intervals/1.3.0/downhole-intervals.schema.json';

export interface BuildIntervalsBodyInput {
  readonly name: string;
  readonly description: string;
  readonly crs: CrsInput;
  /** All coordinates (start+end+mid interleaved, 9 values per row) for bounding box. */
  readonly allCoordinates: Float64Array;
  /** Number of intervals. */
  readonly length: number;
  /** Attribute metadata from prepareIntervalsForUpload. */
  readonly attributes: readonly PreparedAttribute[];
  /** Number of entries in the hole_id lookup table. */
  readonly holeIdLookupLength: number;
  readonly isComposited: boolean;
}

/**
 * Build the complete downhole-intervals JSON body.
 *
 * @param input - Intervals metadata
 * @param tagToRef - Map of blob tag → BlobRef (from orchestrator staging step)
 * @returns Complete object body ready for POST
 */
export function buildIntervalsBody(
  input: BuildIntervalsBodyInput,
  tagToRef: ReadonlyMap<string, BlobRef>,
): unknown {
  const {
    name,
    description,
    crs,
    allCoordinates,
    length,
    attributes,
    holeIdLookupLength,
    isComposited,
  } = input;

  const resolveRef = (tag: string): BlobRef => {
    const ref = tagToRef.get(tag);
    if (!ref) throw new Error(`Missing blob ref for tag "${tag}"`);
    return ref;
  };

  const boundingBox = boundingBoxFromXYZ(allCoordinates);
  const crsWire = normaliseCrs(crs);
  const base = baseSpatialProperties({
    name,
    description,
    boundingBox,
    crs: crsWire,
  });

  const startCoords = floatArrayElement(3, {
    length,
    blobRef: { sha256: resolveRef('start_coordinates') },
  });

  const endCoords = floatArrayElement(3, {
    length,
    blobRef: { sha256: resolveRef('end_coordinates') },
  });

  const midCoords = floatArrayElement(3, {
    length,
    blobRef: { sha256: resolveRef('mid_coordinates') },
  });

  const fromTo = fromToComponent({
    length,
    blobRef: { sha256: resolveRef('from_to') },
  });

  const holeId = categoryDataComponent({
    length,
    valuesBlobRef: { sha256: resolveRef('hole_id.values') },
    lookupBlobRef: { sha256: resolveRef('hole_id.lookup') },
    lookupLength: holeIdLookupLength,
  });

  const attrEntries = attributes.map((attr) => {
    const valuesBlobRef = { sha256: resolveRef(attr.valuesTag) };
    const lookupBlobRef =
      attr.kind === 'category'
        ? { sha256: resolveRef(attr.lookupTag!) }
        : undefined;
    return attributeEntry({
      name: attr.name,
      key: attr.key,
      kind: attr.kind,
      length: attr.length,
      valuesBlobRef,
      lookupBlobRef,
      lookupLength: attr.lookupLength,
    });
  });

  return {
    schema: DOWNHOLE_INTERVALS_SCHEMA,
    ...base,
    is_composited: isComposited,
    start: { coordinates: startCoords },
    end: { coordinates: endCoords },
    mid_points: { coordinates: midCoords },
    from_to: fromTo,
    hole_id: holeId,
    attributes: attrEntries,
  };
}
