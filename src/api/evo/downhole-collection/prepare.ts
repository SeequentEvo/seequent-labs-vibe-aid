import { makeBuilder, Int32, Uint64 } from 'apache-arrow';
import { float64Vector, nullableBoolVector } from '@/lib/arrow';
import {
  buildBlob,
  buildCoordinatesBlob,
  buildCategoryBlobs,
  buildAttributeBlobs,
  reorder,
  type PreparedBlob,
  type PreparedAttribute,
  type PrepareAttributeInput,
} from '@/api/evo/object-prepare';
import type { HoleDictionary, HoleChunk } from './holes';
import { buildHoleDictionary, groupAndSortRows } from './holes';

// ─── Re-exports of shared types ────────────────────────────────────────

export type { PreparedBlob, PreparedAttribute };

// ─── Typed inputs ──────────────────────────────────────────────────────

export interface CollarsInput {
  readonly holeId: readonly string[];
  readonly x: readonly number[];
  readonly y: readonly number[];
  readonly z: readonly number[];
  readonly finalDepth: readonly number[];
  readonly targetDepth: readonly number[];
  readonly currentDepth: readonly number[];
}

export interface PathInput {
  readonly holeId: readonly string[];
  readonly distance: readonly number[];
  readonly azimuth: readonly number[];
  readonly dip: readonly number[];
}

interface BaseChildInput {
  readonly name: string;
  readonly holeId: readonly string[];
  readonly attributes: readonly PrepareAttributeInput[];
}

export interface IntervalChildInput extends BaseChildInput {
  readonly type: 'interval';
  readonly from: readonly number[];
  readonly to: readonly number[];
}

export interface DistanceChildInput extends BaseChildInput {
  readonly type: 'distance';
  readonly distance: readonly number[];
}

export interface PlanarChildInput extends BaseChildInput {
  readonly type: 'planar';
  readonly distance: readonly number[];
  readonly alpha: readonly number[];
  readonly beta: readonly number[];
  readonly polarity?: readonly (boolean | null)[];
}

export interface LineationChildInput extends BaseChildInput {
  readonly type: 'lineation';
  readonly distance: readonly number[];
  readonly alpha: readonly number[];
  readonly beta: readonly number[];
  readonly gamma: readonly number[];
}

export interface DataChildInput extends BaseChildInput {
  readonly type: 'data';
}

export type ChildCollectionInput =
  | IntervalChildInput
  | DistanceChildInput
  | PlanarChildInput
  | LineationChildInput
  | DataChildInput;

export type ChildCollectionType = ChildCollectionInput['type'];

export interface CollectionInput {
  readonly collars: CollarsInput;
  readonly path: PathInput;
  readonly children: readonly ChildCollectionInput[];
}

// ─── Output types ──────────────────────────────────────────────────────

export interface PreparedChildCollection {
  readonly name: string;
  readonly type: ChildCollectionType;
  readonly length: number;
  readonly attributes: readonly PreparedAttribute[];
}

export interface CollectionPrepareResult {
  readonly blobs: readonly PreparedBlob[];
  readonly collarCoordinates: Float64Array;
  readonly collarCount: number;
  readonly pathCount: number;
  readonly holeDictionary: HoleDictionary;
  readonly children: readonly PreparedChildCollection[];
  readonly pathAttributes: readonly PreparedAttribute[];
}

// ─── Helpers ───────────────────────────────────────────────────────────

async function buildHoleChunksBlob(
  tag: string,
  chunks: readonly HoleChunk[],
): Promise<PreparedBlob> {
  const holeIndexBuilder = makeBuilder({ type: new Int32() });
  const offsetBuilder = makeBuilder({ type: new Uint64() });
  const countBuilder = makeBuilder({ type: new Uint64() });

  for (const c of chunks) {
    holeIndexBuilder.append(c.holeIndex);
    offsetBuilder.append(c.offset);
    countBuilder.append(c.count);
  }

  return buildBlob(tag, [
    { name: 'hole_index', vector: holeIndexBuilder.finish().toVector() },
    { name: 'offset', vector: offsetBuilder.finish().toVector() },
    { name: 'count', vector: countBuilder.finish().toVector() },
  ]);
}

// ─── Main prepare ──────────────────────────────────────────────────────

export async function prepareCollectionForUpload(
  input: CollectionInput,
): Promise<CollectionPrepareResult> {
  const { collars, path, children } = input;
  const blobs: PreparedBlob[] = [];

  // 1. Build hole dictionary from collar hole_ids
  const holeDictionary = buildHoleDictionary(collars.holeId);
  const collarCount = collars.holeId.length;

  // 2. Collar coordinates blob (x/y/z) + interleaved Float64Array
  const coords = await buildCoordinatesBlob(
    'collar.coordinates',
    collars.x,
    collars.y,
    collars.z,
    { expectedLength: collarCount },
  );
  blobs.push(coords.blob);

  // 3. Collar distances blob (final/target/current)
  blobs.push(
    await buildBlob('collar.distances', [
      { name: 'final', vector: float64Vector(collars.finalDepth) },
      { name: 'target', vector: float64Vector(collars.targetDepth) },
      { name: 'current', vector: float64Vector(collars.currentDepth) },
    ]),
  );

  // 4. Collar hole_id category encoding
  const holeCat = await buildCategoryBlobs(
    'collar.hole_id',
    collars.holeId as readonly (string | null)[],
    { expectedLength: collarCount },
  );
  blobs.push(...holeCat.blobs);

  // 5. Path — group/sort by hole, sorted by distance within each hole
  const pathGrouped = groupAndSortRows(
    path.holeId,
    holeDictionary,
    (rowIndex) => path.distance[rowIndex]!,
  );

  blobs.push(
    await buildBlob('path', [
      { name: 'distance', vector: float64Vector(reorder(path.distance, pathGrouped.sortedIndices)) },
      { name: 'azimuth', vector: float64Vector(reorder(path.azimuth, pathGrouped.sortedIndices)) },
      { name: 'dip', vector: float64Vector(reorder(path.dip, pathGrouped.sortedIndices)) },
    ]),
  );

  // 6. Location hole chunks (chunks the PATH rows)
  blobs.push(await buildHoleChunksBlob('location.holes', pathGrouped.chunks));

  // 7. Children
  const preparedChildren: PreparedChildCollection[] = [];

  for (let ci = 0; ci < children.length; ci++) {
    const child = children[ci]!;
    const prefix = `child[${String(ci)}]`;

    // Determine sort key based on collection type
    let sortKey: (rowIndex: number) => number;
    switch (child.type) {
      case 'interval':
        sortKey = (rowIndex) => child.from[rowIndex]!;
        break;
      case 'distance':
      case 'planar':
      case 'lineation':
        sortKey = (rowIndex) => child.distance[rowIndex]!;
        break;
      case 'data':
        sortKey = (rowIndex) => rowIndex;
        break;
    }

    const childGrouped = groupAndSortRows(child.holeId, holeDictionary, sortKey);
    const childLength = child.holeId.length;
    const sortedIndices = childGrouped.sortedIndices;

    // Child hole chunks
    blobs.push(await buildHoleChunksBlob(`${prefix}.holes`, childGrouped.chunks));

    // Type-specific structural blobs
    switch (child.type) {
      case 'interval': {
        blobs.push(
          await buildBlob(`${prefix}.from_to`, [
            { name: 'from', vector: float64Vector(reorder(child.from, sortedIndices)) },
            { name: 'to', vector: float64Vector(reorder(child.to, sortedIndices)) },
          ]),
        );
        break;
      }
      case 'distance': {
        blobs.push(
          await buildBlob(`${prefix}.distance`, [
            { name: 'distance', vector: float64Vector(reorder(child.distance, sortedIndices)) },
          ]),
        );
        break;
      }
      case 'planar': {
        blobs.push(
          await buildBlob(`${prefix}.distance`, [
            { name: 'distance', vector: float64Vector(reorder(child.distance, sortedIndices)) },
          ]),
        );
        blobs.push(
          await buildBlob(`${prefix}.plane_angles`, [
            { name: 'alpha', vector: float64Vector(reorder(child.alpha, sortedIndices)) },
            { name: 'beta', vector: float64Vector(reorder(child.beta, sortedIndices)) },
          ]),
        );
        if (child.polarity) {
          blobs.push(
            await buildBlob(`${prefix}.polarity`, [
              {
                name: 'has_positive_polarity',
                vector: nullableBoolVector(reorder(child.polarity, sortedIndices)),
              },
            ]),
          );
        }
        break;
      }
      case 'lineation': {
        blobs.push(
          await buildBlob(`${prefix}.distance`, [
            { name: 'distance', vector: float64Vector(reorder(child.distance, sortedIndices)) },
          ]),
        );
        blobs.push(
          await buildBlob(`${prefix}.lineation_angles`, [
            { name: 'alpha', vector: float64Vector(reorder(child.alpha, sortedIndices)) },
            { name: 'beta', vector: float64Vector(reorder(child.beta, sortedIndices)) },
            { name: 'gamma', vector: float64Vector(reorder(child.gamma, sortedIndices)) },
          ]),
        );
        break;
      }
      case 'data':
        // Data collections have no type-specific geometry blobs
        break;
    }

    // Child attributes
    const childAttrResult = await buildAttributeBlobs(child.attributes, {
      expectedLength: childLength,
      tagPrefix: prefix,
      reorderBy: sortedIndices,
    });
    blobs.push(...childAttrResult.blobs);

    preparedChildren.push({
      name: child.name,
      type: child.type,
      length: childLength,
      attributes: childAttrResult.attributes,
    });
  }

  return {
    blobs,
    collarCoordinates: coords.interleaved,
    collarCount,
    pathCount: path.holeId.length,
    holeDictionary,
    children: preparedChildren,
    pathAttributes: [],
  };
}
