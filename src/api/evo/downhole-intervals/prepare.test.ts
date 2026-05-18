import { describe, it, expect, vi } from 'vitest';
import { prepareIntervalsForUpload } from './prepare';
import type { IntervalsInput } from './prepare';

function minimalInput(
  attributes: IntervalsInput['attributes'] = [],
): IntervalsInput {
  return {
    holeId: ['DH1', 'DH1', 'DH2'],
    from: [0, 10, 0],
    to: [10, 20, 15],
    startX: [1, 2, 3],
    startY: [4, 5, 6],
    startZ: [7, 8, 9],
    endX: [10, 11, 12],
    endY: [13, 14, 15],
    endZ: [16, 17, 18],
    midX: [5.5, 6.5, 7.5],
    midY: [8.5, 9.5, 10.5],
    midZ: [11.5, 12.5, 13.5],
    attributes,
  };
}

describe('prepareIntervalsForUpload', () => {
  it('produces correct base blobs with no attributes', async () => {
    const result = await prepareIntervalsForUpload(minimalInput());

    // 6 base blobs: start_coords, end_coords, mid_coords, from_to, hole_id.values, hole_id.lookup
    expect(result.blobs).toHaveLength(6);
    const tags = result.blobs.map((b) => b.tag);
    expect(tags).toContain('start_coordinates');
    expect(tags).toContain('end_coordinates');
    expect(tags).toContain('mid_coordinates');
    expect(tags).toContain('from_to');
    expect(tags).toContain('hole_id.values');
    expect(tags).toContain('hole_id.lookup');

    expect(result.length).toBe(3);
    expect(result.attributes).toHaveLength(0);
  });

  it('extracts allCoordinates for bounding box computation', async () => {
    const result = await prepareIntervalsForUpload(minimalInput());

    // 3 rows × 9 values per row (start xyz + end xyz + mid xyz)
    expect(result.allCoordinates).toBeInstanceOf(Float64Array);
    expect(result.allCoordinates).toHaveLength(27);

    // First row: start(1,4,7), end(10,13,16), mid(5.5,8.5,11.5)
    expect(result.allCoordinates[0]).toBe(1);
    expect(result.allCoordinates[1]).toBe(4);
    expect(result.allCoordinates[2]).toBe(7);
    expect(result.allCoordinates[3]).toBe(10);
    expect(result.allCoordinates[4]).toBe(13);
    expect(result.allCoordinates[5]).toBe(16);
    expect(result.allCoordinates[6]).toBe(5.5);
    expect(result.allCoordinates[7]).toBe(8.5);
    expect(result.allCoordinates[8]).toBe(11.5);
  });

  it('produces values + lookup blobs for a category attribute', async () => {
    const result = await prepareIntervalsForUpload(
      minimalInput([
        { name: 'rock_type', kind: 'category', values: ['A', 'B', 'A'] },
      ]),
    );

    // 6 base + 2 category (values + lookup)
    expect(result.blobs).toHaveLength(8);
    expect(result.blobs[6]!.tag).toMatch(/\.values$/);
    expect(result.blobs[7]!.tag).toMatch(/\.lookup$/);
    expect(result.attributes[0]!.lookupLength).toBe(2);
  });

  it('handles all attribute types', async () => {
    const result = await prepareIntervalsForUpload(
      minimalInput([
        { name: 'grade', kind: 'scalar', values: [10.5, 20.5, 30.5] },
        { name: 'count', kind: 'integer', values: [100, 200, 300] },
        { name: 'label', kind: 'string', values: ['foo', 'bar', 'baz'] },
        { name: 'rock_type', kind: 'category', values: ['A', 'B', 'A'] },
      ]),
    );

    // 6 base + scalar + integer + string + category(values+lookup) = 11
    expect(result.blobs).toHaveLength(11);
    expect(result.attributes).toHaveLength(4);
    expect(result.attributes[0]!.kind).toBe('scalar');
    expect(result.attributes[1]!.kind).toBe('integer');
    expect(result.attributes[2]!.kind).toBe('string');
    expect(result.attributes[3]!.kind).toBe('category');
  });

  it('generates unique UUID keys for each attribute', async () => {
    const result = await prepareIntervalsForUpload(
      minimalInput([
        { name: 'a', kind: 'scalar', values: [10, 20, 30] },
        { name: 'b', kind: 'scalar', values: [40, 50, 60] },
      ]),
    );

    const keys = result.attributes.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('uses predictable UUID keys when mocked', async () => {
    const uuid1 = '00000000-0000-0000-0000-000000000001';
    const uuid2 = '00000000-0000-0000-0000-000000000002';
    const spy = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(uuid1)
      .mockReturnValueOnce(uuid2);

    try {
      const result = await prepareIntervalsForUpload(
        minimalInput([
          { name: 'grade', kind: 'scalar', values: [10, 20, 30] },
          { name: 'rock', kind: 'category', values: ['A', 'B', 'A'] },
        ]),
      );

      const tags = result.blobs.map((b) => b.tag);
      expect(tags).toContain(`${uuid1}.values`);
      expect(tags).toContain(`${uuid2}.values`);
      expect(tags).toContain(`${uuid2}.lookup`);
    } finally {
      spy.mockRestore();
    }
  });
});
