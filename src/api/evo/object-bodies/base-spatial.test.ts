import { describe, expect, it } from 'vitest';

import type { BoundingBox } from './bounding-box';
import type { BaseSpatialInput } from './base-spatial';
import { baseSpatialProperties } from './base-spatial';

const bbox: BoundingBox = {
  min_x: 0,
  max_x: 10,
  min_y: -5,
  max_y: 5,
  min_z: 100,
  max_z: 200,
};

const baseInput: BaseSpatialInput = {
  name: 'Test Object',
  description: 'A test description',
  boundingBox: bbox,
  crs: 'unspecified',
};

describe('baseSpatialProperties', () => {
  it('returns all required fields', () => {
    const result = baseSpatialProperties(baseInput);

    expect(result).toStrictEqual({
      uuid: null,
      name: 'Test Object',
      description: 'A test description',
      bounding_box: bbox,
      coordinate_reference_system: 'unspecified',
      tags: {},
    });
  });

  it('always sets uuid to null', () => {
    const result = baseSpatialProperties(baseInput);
    expect(result.uuid).toBeNull();
  });

  it('defaults tags to {} when not provided', () => {
    const result = baseSpatialProperties(baseInput);
    expect(result.tags).toStrictEqual({});
  });

  it('passes through tags when provided', () => {
    const tags = { layer: 'geology', source: 'survey' };
    const result = baseSpatialProperties({ ...baseInput, tags });
    expect(result.tags).toStrictEqual(tags);
  });

  it('passes through bounding box unchanged', () => {
    const result = baseSpatialProperties(baseInput);
    expect(result.bounding_box).toStrictEqual(bbox);
  });

  it('passes through CRS "unspecified" unchanged', () => {
    const result = baseSpatialProperties(baseInput);
    expect(result.coordinate_reference_system).toBe('unspecified');
  });

  it('passes through CRS with epsg_code unchanged', () => {
    const crs = { epsg_code: 4326 } as const;
    const result = baseSpatialProperties({ ...baseInput, crs });
    expect(result.coordinate_reference_system).toStrictEqual({ epsg_code: 4326 });
  });
});
