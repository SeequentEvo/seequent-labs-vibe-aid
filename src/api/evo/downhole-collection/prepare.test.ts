import { describe, it, expect } from 'vitest';
import { tableFromIPC } from 'apache-arrow';
import { prepareCollectionForUpload } from './prepare';
import type { CollectionInput } from './prepare';

function minimal2HoleInput(): CollectionInput {
  return {
    collars: {
      holeId: ['H1', 'H2'],
      x: [100, 200],
      y: [50, 60],
      z: [10, 20],
      finalDepth: [500, 600],
      targetDepth: [450, 550],
      currentDepth: [400, 500],
    },
    path: {
      holeId: ['H2', 'H1', 'H1', 'H2'],
      distance: [10, 20, 5, 3],
      azimuth: [90, 180, 0, 45],
      dip: [-30, -45, -60, -20],
    },
    children: [
      {
        name: 'Assays',
        type: 'interval',
        holeId: ['H1', 'H2', 'H1'],
        from: [10, 0, 0],
        to: [20, 5, 10],
        attributes: [
          { name: 'grade', kind: 'scalar', values: [0.5, 1.2, 0.8] },
        ],
      },
    ],
  };
}

describe('prepareCollectionForUpload', () => {
  function blobRowCount(
    result: Awaited<ReturnType<typeof prepareCollectionForUpload>>,
    tag: string,
  ): number {
    const blob = result.blobs.find((b) => b.tag === tag);
    expect(blob).toBeDefined();
    return tableFromIPC(blob!.table.intoIPCStream()).numRows;
  }

  it('produces correct blob count and tags for minimal 2-hole collection', async () => {
    const result = await prepareCollectionForUpload(minimal2HoleInput());

    const tags = result.blobs.map((b) => b.tag);

    // Core blobs:
    // collar.coordinates, collar.distances, collar.hole_id.values, collar.hole_id.lookup
    // path, location.holes
    // child[0].holes, child[0].from_to, child[0].<uuid>.values
    expect(tags).toContain('collar.coordinates');
    expect(tags).toContain('collar.distances');
    expect(tags).toContain('collar.hole_id.values');
    expect(tags).toContain('collar.hole_id.lookup');
    expect(tags).toContain('path');
    expect(tags).toContain('location.holes');
    expect(tags).toContain('child[0].holes');
    expect(tags).toContain('child[0].from_to');

    // 1 scalar attribute = 1 .values blob
    const attrValuesTags = tags.filter((t) =>
      t.startsWith('child[0].') && t.endsWith('.values') && t !== 'child[0].holes',
    );
    expect(attrValuesTags).toHaveLength(1);

    expect(result.blobs).toHaveLength(9);
  });

  it('returns correct collar count and path count', async () => {
    const result = await prepareCollectionForUpload(minimal2HoleInput());
    expect(result.collarCount).toBe(2);
    expect(result.pathCount).toBe(4);
    expect(result.locationHoleChunkCount).toBe(2);
  });

  it('builds location hole chunks once per drill hole, not once per path row', async () => {
    const result = await prepareCollectionForUpload(minimal2HoleInput());

    expect(result.holeDictionary.ids).toHaveLength(2);
    expect(result.pathCount).toBe(4);
    expect(result.locationHoleChunkCount).toBe(2);
    expect(blobRowCount(result, 'path')).toBe(4);
    expect(blobRowCount(result, 'location.holes')).toBe(2);
  });

  it('builds child hole chunks once per represented drill hole, not once per child row', async () => {
    const result = await prepareCollectionForUpload(minimal2HoleInput());

    expect(result.children[0]!.length).toBe(3);
    expect(result.children[0]!.holeChunkCount).toBe(2);
    expect(blobRowCount(result, 'child[0].from_to')).toBe(3);
    expect(blobRowCount(result, 'child[0].holes')).toBe(2);
  });

  it('builds hole dictionary from collar CSV', async () => {
    const result = await prepareCollectionForUpload(minimal2HoleInput());
    expect(result.holeDictionary.ids).toEqual(['H1', 'H2']);
    expect(result.holeDictionary.indexMap.get('H1')).toBe(0);
    expect(result.holeDictionary.indexMap.get('H2')).toBe(1);
  });

  it('returns collar coordinates as interleaved Float64Array', async () => {
    const result = await prepareCollectionForUpload(minimal2HoleInput());
    expect(result.collarCoordinates).toBeInstanceOf(Float64Array);
    expect(result.collarCoordinates).toHaveLength(6);
    // H1: x=100, y=50, z=10
    expect(result.collarCoordinates[0]).toBe(100);
    expect(result.collarCoordinates[1]).toBe(50);
    expect(result.collarCoordinates[2]).toBe(10);
  });

  it('returns prepared children metadata', async () => {
    const result = await prepareCollectionForUpload(minimal2HoleInput());
    expect(result.children).toHaveLength(1);
    expect(result.children[0]!.name).toBe('Assays');
    expect(result.children[0]!.type).toBe('interval');
    expect(result.children[0]!.length).toBe(3);
    expect(result.children[0]!.holeChunkCount).toBe(2);
    expect(result.children[0]!.attributes).toHaveLength(1);
    expect(result.children[0]!.attributes[0]!.name).toBe('grade');
    expect(result.children[0]!.attributes[0]!.kind).toBe('scalar');
  });

  it('category-encodes collar hole_id', async () => {
    const result = await prepareCollectionForUpload(minimal2HoleInput());
    const tags = result.blobs.map((b) => b.tag);
    expect(tags).toContain('collar.hole_id.values');
    expect(tags).toContain('collar.hole_id.lookup');
  });

  it('returns empty pathAttributes', async () => {
    const result = await prepareCollectionForUpload(minimal2HoleInput());
    expect(result.pathAttributes).toEqual([]);
  });
});
