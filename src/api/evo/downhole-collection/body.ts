import type { BlobRef } from '@/api/evo/blob';
import type { CrsInput } from '@/api/evo/object-bodies';
import {
  baseSpatialProperties,
  boundingBoxFromXYZ,
  normaliseCrs,
  floatArrayElement,
  holeChunksElement,
  categoryDataComponent,
  fromToComponent,
  boolArrayElement,
  attributeEntry,
} from '@/api/evo/object-bodies';
import type { PreparedAttribute } from '@/api/evo/object-prepare';
import type { HoleDictionary } from './holes';
import type { PreparedChildCollection } from './prepare';

const DOWNHOLE_COLLECTION_SCHEMA =
  '/objects/downhole-collection/1.3.1/downhole-collection.schema.json';

export interface BuildCollectionBodyInput {
  readonly name: string;
  readonly description: string;
  readonly crs: CrsInput;
  readonly collarCoordinates: Float64Array;
  readonly collarCount: number;
  readonly pathCount: number;
  readonly holeDictionary: HoleDictionary;
  readonly children: readonly PreparedChildCollection[];
  readonly distanceUnit?: string;
  readonly desurvey?: string;
  readonly pathAttributes: readonly PreparedAttribute[];
}

function resolveRef(
  tagToRef: ReadonlyMap<string, BlobRef>,
  tag: string,
): BlobRef {
  const ref = tagToRef.get(tag);
  if (!ref) throw new Error(`Missing blob ref for tag "${tag}"`);
  return ref;
}

function buildChildBody(
  child: PreparedChildCollection,
  childIndex: number,
  tagToRef: ReadonlyMap<string, BlobRef>,
  distanceUnit?: string,
): unknown {
  const prefix = `child[${String(childIndex)}]`;
  const resolve = (suffix: string) =>
    resolveRef(tagToRef, `${prefix}.${suffix}`);

  const holesRef = resolve('holes');

  const attrEntries = child.attributes.map((attr) => {
    const valuesBlobRef = { sha256: resolveRef(tagToRef, attr.valuesTag) };
    const lookupBlobRef =
      attr.kind === 'category' && attr.lookupTag !== undefined
        ? { sha256: resolveRef(tagToRef, attr.lookupTag) }
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

  const base = {
    name: child.name,
    collection_type: child.type,
    holes: holeChunksElement({ length: child.length, blobRef: { sha256: holesRef } }),
  };

  switch (child.type) {
    case 'interval':
      return {
        ...base,
        from_to: {
          ...fromToComponent({
            length: child.length,
            blobRef: { sha256: resolve('from_to') },
            unit: distanceUnit,
          }),
          attributes: attrEntries,
        },
      };

    case 'distance':
      return {
        ...base,
        distance: {
          values: floatArrayElement(1, {
            length: child.length,
            blobRef: { sha256: resolve('distance') },
          }),
          attributes: attrEntries,
        },
      };

    case 'data':
      return {
        ...base,
        attributes: attrEntries,
      };

    case 'planar': {
      const result: Record<string, unknown> = {
        ...base,
        distance: {
          values: floatArrayElement(1, {
            length: child.length,
            blobRef: { sha256: resolve('distance') },
          }),
          attributes: attrEntries,
        },
        relative_plane_angles: floatArrayElement(2, {
          length: child.length,
          blobRef: { sha256: resolve('plane_angles') },
        }),
      };
      const polTag = `${prefix}.polarity`;
      if (tagToRef.has(polTag)) {
        result['plane_polarity'] = boolArrayElement({
          length: child.length,
          blobRef: { sha256: resolveRef(tagToRef, polTag) },
        });
      }
      return result;
    }

    case 'lineation':
      return {
        ...base,
        distance: {
          values: floatArrayElement(1, {
            length: child.length,
            blobRef: { sha256: resolve('distance') },
          }),
          attributes: attrEntries,
        },
        relative_lineation_angles: floatArrayElement(3, {
          length: child.length,
          blobRef: { sha256: resolve('lineation_angles') },
        }),
      };
  }
}

export function buildCollectionBody(
  input: BuildCollectionBodyInput,
  tagToRef: ReadonlyMap<string, BlobRef>,
): unknown {
  const {
    name,
    description,
    crs,
    collarCoordinates,
    collarCount,
    pathCount,
    holeDictionary,
    children,
    distanceUnit,
    desurvey,
    pathAttributes,
  } = input;

  const resolve = (tag: string) => resolveRef(tagToRef, tag);

  const boundingBox = boundingBoxFromXYZ(collarCoordinates);
  const crsWire = normaliseCrs(crs);
  const base = baseSpatialProperties({ name, description, boundingBox, crs: crsWire });

  const pathAttrEntries = pathAttributes.map((attr) => {
    const valuesBlobRef = { sha256: resolve(attr.valuesTag) };
    const lookupBlobRef =
      attr.kind === 'category' && attr.lookupTag !== undefined
        ? { sha256: resolve(attr.lookupTag) }
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

  const location = {
    coordinates: floatArrayElement(3, {
      length: collarCount,
      blobRef: { sha256: resolve('collar.coordinates') },
    }),
    distances: floatArrayElement(3, {
      length: collarCount,
      blobRef: { sha256: resolve('collar.distances') },
    }),
    holes: holeChunksElement({
      length: pathCount,
      blobRef: { sha256: resolve('location.holes') },
    }),
    hole_id: categoryDataComponent({
      length: collarCount,
      valuesBlobRef: { sha256: resolve('collar.hole_id.values') },
      lookupBlobRef: { sha256: resolve('collar.hole_id.lookup') },
      lookupLength: holeDictionary.ids.length,
    }),
    attributes: [],
    path: {
      ...floatArrayElement(3, {
        length: pathCount,
        blobRef: { sha256: resolve('path') },
      }),
      attributes: pathAttrEntries,
    },
  };

  const collections = children.map((child, i) =>
    buildChildBody(child, i, tagToRef, distanceUnit),
  );

  return {
    schema: DOWNHOLE_COLLECTION_SCHEMA,
    ...base,
    type: 'downhole',
    ...(distanceUnit !== undefined && { distance_unit: distanceUnit }),
    desurvey: desurvey ?? 'minimum_curvature',
    location,
    collections,
  };
}
