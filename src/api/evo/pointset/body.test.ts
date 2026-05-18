import { describe, it, expect } from 'vitest';
import { asBlobRef } from '@/api/evo/blob';
import type { BlobRef } from '@/api/evo/blob';
import { buildPointsetBody } from './body';
import type { BuildPointsetBodyInput } from './body';

const hash1 = asBlobRef('a'.repeat(64));
const hash2 = asBlobRef('b'.repeat(64));
const hash3 = asBlobRef('c'.repeat(64));

// 3 points: (1,2,3), (4,5,6), (7,8,9)
const coords = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);

function baseInput(
  overrides?: Partial<BuildPointsetBodyInput>,
): BuildPointsetBodyInput {
  return {
    name: 'Test Pointset',
    description: 'A test pointset',
    crs: 'unspecified' as const,
    coordinates: coords,
    length: 3,
    attributes: [],
    ...overrides,
  };
}

describe('buildPointsetBody', () => {
  it('builds a minimal pointset with no attributes', () => {
    const tagToRef = new Map<string, BlobRef>([['coordinates', hash1]]);
    const body = buildPointsetBody(baseInput(), tagToRef) as Record<
      string,
      unknown
    >;

    expect(body.schema).toBe(
      '/objects/pointset/1.3.0/pointset.schema.json',
    );
    expect(body.uuid).toBeNull();
    expect(body.name).toBe('Test Pointset');
    expect(body.description).toBe('A test pointset');
    expect(body.coordinate_reference_system).toBe('unspecified');
    expect(body.tags).toEqual({});
    expect(body.bounding_box).toEqual({
      min_x: 1,
      max_x: 7,
      min_y: 2,
      max_y: 8,
      min_z: 3,
      max_z: 9,
    });

    const locations = body.locations as {
      coordinates: { data: string; width: number };
      attributes: unknown[];
    };
    expect(locations.coordinates.data).toBe(hash1);
    expect(locations.coordinates.width).toBe(3);
    expect(locations.attributes).toEqual([]);
  });

  it('includes a scalar attribute with nan_description', () => {
    const tagToRef = new Map<string, BlobRef>([
      ['coordinates', hash1],
      ['k1.values', hash2],
    ]);

    const body = buildPointsetBody(
      baseInput({
        attributes: [
          { name: 'Grade', key: 'k1', kind: 'scalar', length: 3, valuesTag: 'k1.values' },
        ],
      }),
      tagToRef,
    ) as Record<string, unknown>;

    const locations = body.locations as {
      attributes: {
        attribute_type: string;
        values: { data: string };
        nan_description: unknown;
      }[];
    };

    expect(locations.attributes).toHaveLength(1);
    const attr = locations.attributes[0]!;
    expect(attr.attribute_type).toBe('scalar');
    expect(attr.values.data).toBe(hash2);
    expect(attr.nan_description).toEqual({ values: [] });
  });

  it('includes a category attribute with lookup table', () => {
    const tagToRef = new Map<string, BlobRef>([
      ['coordinates', hash1],
      ['k2.values', hash2],
      ['k2.lookup', hash3],
    ]);

    const body = buildPointsetBody(
      baseInput({
        attributes: [
          {
            name: 'Lithology',
            key: 'k2',
            kind: 'category',
            length: 3,
            valuesTag: 'k2.values',
            lookupTag: 'k2.lookup',
            lookupLength: 5,
          },
        ],
      }),
      tagToRef,
    ) as Record<string, unknown>;

    const locations = body.locations as {
      attributes: {
        attribute_type: string;
        table: { data: string; length: number };
      }[];
    };

    expect(locations.attributes).toHaveLength(1);
    const attr = locations.attributes[0]!;
    expect(attr.attribute_type).toBe('category');
    expect(attr.table.data).toBe(hash3);
    expect(attr.table.length).toBe(5);
  });

  it('throws when a blob ref is missing', () => {
    const tagToRef = new Map<string, BlobRef>();

    expect(() => buildPointsetBody(baseInput(), tagToRef)).toThrow(
      'Missing blob ref for tag "coordinates"',
    );
  });

  it('passes through EPSG CRS', () => {
    const tagToRef = new Map<string, BlobRef>([['coordinates', hash1]]);

    const body = buildPointsetBody(
      baseInput({ crs: { epsgCode: 4326 } }),
      tagToRef,
    ) as Record<string, unknown>;

    expect(body.coordinate_reference_system).toEqual({ epsg_code: 4326 });
  });
});
