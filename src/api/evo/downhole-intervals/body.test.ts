import { describe, it, expect } from 'vitest';
import { asBlobRef } from '@/api/evo/blob';
import type { BlobRef } from '@/api/evo/blob';
import { buildIntervalsBody } from './body';
import type { BuildIntervalsBodyInput } from './body';

const hash1 = asBlobRef('a'.repeat(64));
const hash2 = asBlobRef('b'.repeat(64));
const hash3 = asBlobRef('c'.repeat(64));
const hash4 = asBlobRef('d'.repeat(64));
const hash5 = asBlobRef('e'.repeat(64));
const hash6 = asBlobRef('f'.repeat(64));
const hash7 = asBlobRef('1'.repeat(64));
const hash8 = asBlobRef('2'.repeat(64));

// 2 intervals: all coordinates interleaved as start(xyz)+end(xyz)+mid(xyz) per row
const allCoords = new Float64Array([
  1, 2, 3, 10, 11, 12, 5, 6, 7, // row 1
  4, 5, 6, 13, 14, 15, 8, 9, 10, // row 2
]);

function baseTagToRef(): Map<string, BlobRef> {
  return new Map<string, BlobRef>([
    ['start_coordinates', hash1],
    ['end_coordinates', hash2],
    ['mid_coordinates', hash3],
    ['from_to', hash4],
    ['hole_id.values', hash5],
    ['hole_id.lookup', hash6],
  ]);
}

function baseInput(
  overrides?: Partial<BuildIntervalsBodyInput>,
): BuildIntervalsBodyInput {
  return {
    name: 'Test Intervals',
    description: 'A test downhole intervals object',
    crs: 'unspecified' as const,
    allCoordinates: allCoords,
    length: 2,
    attributes: [],
    holeIdLookupLength: 2,
    isComposited: false,
    ...overrides,
  };
}

describe('buildIntervalsBody', () => {
  it('builds a minimal body with no attributes', () => {
    const body = buildIntervalsBody(
      baseInput(),
      baseTagToRef(),
    ) as Record<string, unknown>;

    expect(body.schema).toBe(
      '/objects/downhole-intervals/1.3.0/downhole-intervals.schema.json',
    );
    expect(body.uuid).toBeNull();
    expect(body.name).toBe('Test Intervals');
    expect(body.description).toBe('A test downhole intervals object');
    expect(body.coordinate_reference_system).toBe('unspecified');
    expect(body.tags).toEqual({});
    expect(body.is_composited).toBe(false);

    // Bounding box from all coordinates
    expect(body.bounding_box).toEqual({
      min_x: 1,
      max_x: 13,
      min_y: 2,
      max_y: 14,
      min_z: 3,
      max_z: 15,
    });

    // Start coordinates
    const start = body.start as { coordinates: { data: string; width: number } };
    expect(start.coordinates.data).toBe(hash1);
    expect(start.coordinates.width).toBe(3);

    // End coordinates
    const end = body.end as { coordinates: { data: string; width: number } };
    expect(end.coordinates.data).toBe(hash2);
    expect(end.coordinates.width).toBe(3);

    // Mid coordinates
    const mid = body.mid_points as { coordinates: { data: string; width: number } };
    expect(mid.coordinates.data).toBe(hash3);
    expect(mid.coordinates.width).toBe(3);

    // From/to
    const fromTo = body.from_to as { intervals: { start_and_end: { data: string; width: number } } };
    expect(fromTo.intervals.start_and_end.data).toBe(hash4);
    expect(fromTo.intervals.start_and_end.width).toBe(2);

    // Hole ID
    const holeId = body.hole_id as {
      values: { data: string };
      table: { data: string; length: number };
    };
    expect(holeId.values.data).toBe(hash5);
    expect(holeId.table.data).toBe(hash6);
    expect(holeId.table.length).toBe(2);

    expect(body.attributes).toEqual([]);
  });

  it('includes a scalar attribute with nan_description', () => {
    const tagToRef = baseTagToRef();
    tagToRef.set('k1.values', hash7);

    const body = buildIntervalsBody(
      baseInput({
        attributes: [
          { name: 'Grade', key: 'k1', kind: 'scalar', length: 2, valuesTag: 'k1.values' },
        ],
      }),
      tagToRef,
    ) as Record<string, unknown>;

    const attrs = body.attributes as {
      attribute_type: string;
      values: { data: string };
      nan_description: unknown;
    }[];

    expect(attrs).toHaveLength(1);
    const attr = attrs[0]!;
    expect(attr.attribute_type).toBe('scalar');
    expect(attr.values.data).toBe(hash7);
    expect(attr.nan_description).toEqual({ values: [] });
  });

  it('includes a category attribute with lookup table', () => {
    const tagToRef = baseTagToRef();
    tagToRef.set('k2.values', hash7);
    tagToRef.set('k2.lookup', hash8);

    const body = buildIntervalsBody(
      baseInput({
        attributes: [
          {
            name: 'Lithology',
            key: 'k2',
            kind: 'category',
            length: 2,
            valuesTag: 'k2.values',
            lookupTag: 'k2.lookup',
            lookupLength: 5,
          },
        ],
      }),
      tagToRef,
    ) as Record<string, unknown>;

    const attrs = body.attributes as {
      attribute_type: string;
      table: { data: string; length: number };
    }[];

    expect(attrs).toHaveLength(1);
    const attr = attrs[0]!;
    expect(attr.attribute_type).toBe('category');
    expect(attr.table.data).toBe(hash8);
    expect(attr.table.length).toBe(5);
  });

  it('throws when a blob ref is missing', () => {
    const tagToRef = new Map<string, BlobRef>();

    expect(() => buildIntervalsBody(baseInput(), tagToRef)).toThrow(
      'Missing blob ref for tag "start_coordinates"',
    );
  });

  it('passes through EPSG CRS', () => {
    const body = buildIntervalsBody(
      baseInput({ crs: { epsgCode: 4326 } }),
      baseTagToRef(),
    ) as Record<string, unknown>;

    expect(body.coordinate_reference_system).toEqual({ epsg_code: 4326 });
  });

  it('sets is_composited to true', () => {
    const body = buildIntervalsBody(
      baseInput({ isComposited: true }),
      baseTagToRef(),
    ) as Record<string, unknown>;

    expect(body.is_composited).toBe(true);
  });
});
