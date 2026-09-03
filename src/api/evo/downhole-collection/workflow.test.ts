import { describe, it, expect } from 'vitest';
import { tableFromIPC } from 'apache-arrow';
import { asBlobRef, type BlobRef } from '@/api/evo/blob';
import { buildCollectionBody } from './body';
import { prepareCollectionForUpload } from './prepare';
import type { CollectionInput, CollectionPrepareResult } from './prepare';

function downholeWorkflowInput(): CollectionInput {
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

function tagToRefFromPreparedBlobs(
  result: CollectionPrepareResult,
): Map<string, BlobRef> {
  return new Map(
    result.blobs.map((blob, index) => [
      blob.tag,
      asBlobRef((index + 1).toString(16).repeat(64)),
    ]),
  );
}

function blobRowCount(result: CollectionPrepareResult, tag: string): number {
  const blob = result.blobs.find((candidate) => candidate.tag === tag);
  expect(blob).toBeDefined();
  return tableFromIPC(blob!.table.intoIPCStream()).numRows;
}

function recordAt(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = record[key];
  expect(value).toBeDefined();
  expect(value).toBeTypeOf('object');
  return value as Record<string, unknown>;
}

async function buildWorkflowObject(): Promise<{
  readonly prepared: CollectionPrepareResult;
  readonly body: Record<string, unknown>;
}> {
  const prepared = await prepareCollectionForUpload(downholeWorkflowInput());
  const body = buildCollectionBody(
    {
      name: 'Workflow Collection',
      description: 'Checks metadata lengths against generated blobs',
      crs: 'unspecified',
      collarCoordinates: prepared.collarCoordinates,
      collarCount: prepared.collarCount,
      pathCount: prepared.pathCount,
      locationHoleChunkCount: prepared.locationHoleChunkCount,
      holeDictionary: prepared.holeDictionary,
      children: prepared.children,
      pathAttributes: prepared.pathAttributes,
    },
    tagToRefFromPreparedBlobs(prepared),
  ) as Record<string, unknown>;

  return { prepared, body };
}

describe('downhole collection prepare-to-body workflow', () => {
  it('declares location lengths that match the generated blob row counts', async () => {
    const { prepared, body } = await buildWorkflowObject();
    const location = recordAt(body, 'location');

    expect(recordAt(location, 'path').length).toBe(
      blobRowCount(prepared, 'path'),
    );
    expect(recordAt(location, 'holes').length).toBe(
      blobRowCount(prepared, 'location.holes'),
    );
  });

  it('declares child collection lengths that match the generated blob row counts', async () => {
    const { prepared, body } = await buildWorkflowObject();

    const collections = body.collections as Record<string, unknown>[];
    expect(collections).toHaveLength(1);

    const intervalCollection = collections[0]!;
    const fromTo = recordAt(intervalCollection, 'from_to');
    const intervals = recordAt(fromTo, 'intervals');
    expect(recordAt(intervals, 'start_and_end').length).toBe(
      blobRowCount(prepared, 'child[0].from_to'),
    );
    expect(recordAt(intervalCollection, 'holes').length).toBe(
      blobRowCount(prepared, 'child[0].holes'),
    );
  });
});
