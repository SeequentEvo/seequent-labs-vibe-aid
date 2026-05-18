import { describe, it, expect } from 'vitest';
import { asBlobRef } from '@/api/evo/blob';
import type { BlobRef } from '@/api/evo/blob';
import { buildCollectionBody } from './body';
import type { BuildCollectionBodyInput } from './body';
import type { HoleDictionary } from './holes';
import type { PreparedChildCollection } from './prepare';

const hash = (c: string) => asBlobRef(c.repeat(64));

function baseDictionary(): HoleDictionary {
  return {
    ids: ['H1', 'H2'],
    indexMap: new Map([['H1', 0], ['H2', 1]]),
  };
}

function baseInput(
  overrides?: Partial<BuildCollectionBodyInput>,
): BuildCollectionBodyInput {
  return {
    name: 'Test Collection',
    description: 'A test downhole collection',
    crs: 'unspecified' as const,
    collarCoordinates: new Float64Array([100, 50, 10, 200, 60, 20]),
    collarCount: 2,
    pathCount: 4,
    holeDictionary: baseDictionary(),
    children: [],
    pathAttributes: [],
    ...overrides,
  };
}

function baseTags(): Map<string, BlobRef> {
  return new Map<string, BlobRef>([
    ['collar.coordinates', hash('a')],
    ['collar.distances', hash('b')],
    ['collar.hole_id.values', hash('c')],
    ['collar.hole_id.lookup', hash('d')],
    ['location.holes', hash('e')],
    ['path', hash('f')],
  ]);
}

describe('buildCollectionBody', () => {
  it('builds a minimal body with no children', () => {
    const body = buildCollectionBody(baseInput(), baseTags()) as Record<
      string,
      unknown
    >;

    expect(body.schema).toBe(
      '/objects/downhole-collection/1.3.1/downhole-collection.schema.json',
    );
    expect(body.uuid).toBeNull();
    expect(body.name).toBe('Test Collection');
    expect(body.type).toBe('downhole');
    expect(body.distance_unit).toBeUndefined();
    expect(body.desurvey).toBe('minimum_curvature');
    expect(body.coordinate_reference_system).toBe('unspecified');
    expect(body.collections).toEqual([]);

    const loc = body.location as Record<string, unknown>;
    expect(loc.coordinates).toBeDefined();
    expect(loc.distances).toBeDefined();
    expect(loc.holes).toBeDefined();
    expect(loc.hole_id).toBeDefined();
    expect(loc.attributes).toEqual([]);
    expect(loc.path).toBeDefined();
  });

  it('builds body with one interval child', () => {
    const intervalChild: PreparedChildCollection = {
      name: 'Assays',
      type: 'interval',
      length: 3,
      attributes: [
        { name: 'grade', key: 'k1', kind: 'scalar', length: 3, valuesTag: 'child[0].k1.values' },
      ],
    };

    const tags = baseTags();
    tags.set('child[0].holes', hash('g'));
    tags.set('child[0].from_to', hash('h'));
    tags.set('child[0].k1.values', hash('i'));

    const body = buildCollectionBody(
      baseInput({ children: [intervalChild] }),
      tags,
    ) as Record<string, unknown>;

    const collections = body.collections as Record<string, unknown>[];
    expect(collections).toHaveLength(1);

    const c = collections[0]!;
    expect(c.name).toBe('Assays');
    expect(c.collection_type).toBe('interval');
    expect(c.holes).toBeDefined();
    expect(c.from_to).toBeDefined();

    const fromTo = c.from_to as Record<string, unknown>;
    expect(fromTo.intervals).toBeDefined();
    expect(fromTo.unit).toBeUndefined();
    expect(fromTo.attributes).toHaveLength(1);
  });

  it('builds body with all 5 child types', () => {
    const children: PreparedChildCollection[] = [
      { name: 'Assays', type: 'interval', length: 3, attributes: [] },
      { name: 'Samples', type: 'distance', length: 2, attributes: [] },
      { name: 'Metadata', type: 'data', length: 4, attributes: [] },
      { name: 'Planes', type: 'planar', length: 2, attributes: [] },
      { name: 'Lines', type: 'lineation', length: 1, attributes: [] },
    ];

    const tags = baseTags();
    // interval
    tags.set('child[0].holes', hash('g'));
    tags.set('child[0].from_to', hash('h'));
    // distance
    tags.set('child[1].holes', hash('i'));
    tags.set('child[1].distance', hash('j'));
    // data
    tags.set('child[2].holes', hash('k'));
    // planar
    tags.set('child[3].holes', hash('l'));
    tags.set('child[3].distance', hash('m'));
    tags.set('child[3].plane_angles', hash('n'));
    // lineation
    tags.set('child[4].holes', hash('o'));
    tags.set('child[4].distance', hash('p'));
    tags.set('child[4].lineation_angles', hash('q'));

    const body = buildCollectionBody(
      baseInput({ children }),
      tags,
    ) as Record<string, unknown>;

    const cols = body.collections as Record<string, unknown>[];
    expect(cols).toHaveLength(5);

    expect(cols[0]!.collection_type).toBe('interval');
    expect(cols[0]!.from_to).toBeDefined();

    expect(cols[1]!.collection_type).toBe('distance');
    expect(cols[1]!.distance).toBeDefined();

    expect(cols[2]!.collection_type).toBe('data');
    expect(cols[2]!.attributes).toEqual([]);

    expect(cols[3]!.collection_type).toBe('planar');
    expect(cols[3]!.relative_plane_angles).toBeDefined();

    expect(cols[4]!.collection_type).toBe('lineation');
    expect(cols[4]!.relative_lineation_angles).toBeDefined();
  });

  it('uses custom distance_unit and desurvey', () => {
    const body = buildCollectionBody(
      baseInput({ distanceUnit: 'ft', desurvey: 'tangential' }),
      baseTags(),
    ) as Record<string, unknown>;

    expect(body.distance_unit).toBe('ft');
    expect(body.desurvey).toBe('tangential');
  });

  it('throws when a blob ref is missing', () => {
    expect(() =>
      buildCollectionBody(baseInput(), new Map<string, BlobRef>()),
    ).toThrow('Missing blob ref for tag');
  });

  it('passes through EPSG CRS', () => {
    const body = buildCollectionBody(
      baseInput({ crs: { epsgCode: 4326 } }),
      baseTags(),
    ) as Record<string, unknown>;

    expect(body.coordinate_reference_system).toEqual({ epsg_code: 4326 });
  });

  it('includes planar polarity when tag is present', () => {
    const children: PreparedChildCollection[] = [
      { name: 'Planes', type: 'planar', length: 2, attributes: [] },
    ];
    const tags = baseTags();
    tags.set('child[0].holes', hash('g'));
    tags.set('child[0].distance', hash('h'));
    tags.set('child[0].plane_angles', hash('i'));
    tags.set('child[0].polarity', hash('j'));

    const body = buildCollectionBody(
      baseInput({ children }),
      tags,
    ) as Record<string, unknown>;

    const cols = body.collections as Record<string, unknown>[];
    expect(cols[0]!.plane_polarity).toBeDefined();
  });
});
