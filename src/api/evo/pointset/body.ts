import type { BlobRef } from '@/api/evo/blob';
import type { CrsInput } from '@/api/evo/object-bodies';
import {
  baseSpatialProperties,
  boundingBoxFromXYZ,
  normaliseCrs,
  floatArrayElement,
  attributeEntry,
  locationsComponent,
} from '@/api/evo/object-bodies';
import type { PreparedAttribute } from '@/api/evo/object-prepare';

const POINTSET_SCHEMA = '/objects/pointset/1.3.0/pointset.schema.json';

export interface BuildPointsetBodyInput {
  readonly name: string;
  readonly description: string;
  readonly crs: CrsInput;
  /** Interleaved XYZ coordinates from prepareForUpload. */
  readonly coordinates: Float64Array;
  /** Number of points. */
  readonly length: number;
  /** Attribute metadata from prepareForUpload. */
  readonly attributes: readonly PreparedAttribute[];
}

/**
 * Build the complete pointset JSON body.
 *
 * @param input - Pointset metadata
 * @param tagToRef - Map of blob tag → BlobRef (from orchestrator staging step)
 * @returns Complete object body ready for POST
 */
export function buildPointsetBody(
  input: BuildPointsetBodyInput,
  tagToRef: ReadonlyMap<string, BlobRef>,
): unknown {
  const { name, description, crs, coordinates, length, attributes } = input;

  const resolveRef = (tag: string): BlobRef => {
    const ref = tagToRef.get(tag);
    if (!ref) throw new Error(`Missing blob ref for tag "${tag}"`);
    return ref;
  };

  const boundingBox = boundingBoxFromXYZ(coordinates);
  const crsWire = normaliseCrs(crs);
  const base = baseSpatialProperties({ name, description, boundingBox, crs: crsWire });

  const coordsElement = floatArrayElement(3, {
    length,
    blobRef: { sha256: resolveRef('coordinates') },
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

  const locations = locationsComponent(coordsElement, attrEntries);

  return {
    schema: POINTSET_SCHEMA,
    ...base,
    locations,
  };
}
