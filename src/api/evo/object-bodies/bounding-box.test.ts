import { describe, expect, it } from 'vitest';

import { boundingBoxFromXYZ } from './bounding-box';

describe('boundingBoxFromXYZ', () => {
  it('returns min === max for a single point', () => {
    const coords = new Float64Array([3, -5, 7]);
    const box = boundingBoxFromXYZ(coords);

    expect(box).toEqual({
      min_x: 3,
      max_x: 3,
      min_y: -5,
      max_y: -5,
      min_z: 7,
      max_z: 7,
    });
  });

  it('computes correct min/max for mixed positive/negative values', () => {
    const coords = new Float64Array([
      -1, 2, -3,
      4, -5, 6,
      0, 0, 0,
    ]);
    const box = boundingBoxFromXYZ(coords);

    expect(box).toEqual({
      min_x: -1,
      max_x: 4,
      min_y: -5,
      max_y: 2,
      min_z: -3,
      max_z: 6,
    });
  });

  it('handles a large dataset with known extremes', () => {
    const count = 1000;
    const coords = new Float64Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
      coords[i] = 0;
    }

    // Place extremes at specific indices
    const minIdx = 42;
    const maxIdx = 873;
    coords[minIdx * 3] = -999;
    coords[minIdx * 3 + 1] = -888;
    coords[minIdx * 3 + 2] = -777;
    coords[maxIdx * 3] = 999;
    coords[maxIdx * 3 + 1] = 888;
    coords[maxIdx * 3 + 2] = 777;

    const box = boundingBoxFromXYZ(coords);

    expect(box).toEqual({
      min_x: -999,
      max_x: 999,
      min_y: -888,
      max_y: 888,
      min_z: -777,
      max_z: 777,
    });
  });

  it('throws for an empty array', () => {
    expect(() => boundingBoxFromXYZ(new Float64Array([]))).toThrow(
      'Cannot compute bounding box from empty coordinates',
    );
  });

  it('throws when length is not a multiple of 3', () => {
    expect(() => boundingBoxFromXYZ(new Float64Array([1, 2]))).toThrow(
      'Coordinate array length must be a multiple of 3',
    );
  });

  it('returns all zeros for all-zero coordinates', () => {
    const coords = new Float64Array([0, 0, 0, 0, 0, 0]);
    const box = boundingBoxFromXYZ(coords);

    expect(box).toEqual({
      min_x: 0,
      max_x: 0,
      min_y: 0,
      max_y: 0,
      min_z: 0,
      max_z: 0,
    });
  });
});
