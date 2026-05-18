import { describe, it, expect, vi } from 'vitest';
import { prepareForUpload } from './prepare';
import type { PointsetInput } from './prepare';

describe('prepareForUpload', () => {
  it('prepares coordinates + one scalar attribute', async () => {
    const input: PointsetInput = {
      x: [1, 4, 7],
      y: [2, 5, 8],
      z: [3, 6, 9],
      attributes: [{ name: 'grade', kind: 'scalar', values: [10.5, 20.5, 30.5] }],
    };

    const result = await prepareForUpload(input);

    expect(result.blobs).toHaveLength(2);
    expect(result.blobs[0]!.tag).toBe('coordinates');
    expect(result.coordinates).toBeInstanceOf(Float64Array);
    expect(result.coordinates).toHaveLength(9);
    expect(result.coordinates[0]).toBe(1);
    expect(result.coordinates[1]).toBe(2);
    expect(result.coordinates[2]).toBe(3);
    expect(result.length).toBe(3);
    expect(result.attributes).toHaveLength(1);
    expect(result.attributes[0]!.name).toBe('grade');
    expect(result.attributes[0]!.kind).toBe('scalar');
    expect(result.attributes[0]!.length).toBe(3);
    expect(result.blobs[1]!.tag).toMatch(/\.values$/);
  });

  it('produces two blobs for a category attribute', async () => {
    const input: PointsetInput = {
      x: [1, 2, 3],
      y: [4, 5, 6],
      z: [7, 8, 9],
      attributes: [{ name: 'rock_type', kind: 'category', values: ['A', 'B', 'A'] }],
    };

    const result = await prepareForUpload(input);

    expect(result.blobs).toHaveLength(3);
    expect(result.blobs[0]!.tag).toBe('coordinates');
    expect(result.blobs[1]!.tag).toMatch(/\.values$/);
    expect(result.blobs[2]!.tag).toMatch(/\.lookup$/);
    expect(result.attributes[0]!.lookupLength).toBe(2);
  });

  it('handles all attribute types', async () => {
    const input: PointsetInput = {
      x: [1, 2, 3],
      y: [4, 5, 6],
      z: [7, 8, 9],
      attributes: [
        { name: 'grade', kind: 'scalar', values: [10.5, 20.5, 30.5] },
        { name: 'count', kind: 'integer', values: [100, 200, 300] },
        { name: 'label', kind: 'string', values: ['foo', 'bar', 'baz'] },
        { name: 'rock_type', kind: 'category', values: ['A', 'B', 'A'] },
      ],
    };

    const result = await prepareForUpload(input);

    // coords + scalar + integer + string + category(values+lookup)
    expect(result.blobs).toHaveLength(6);
    expect(result.attributes).toHaveLength(4);
    expect(result.attributes[0]!.kind).toBe('scalar');
    expect(result.attributes[1]!.kind).toBe('integer');
    expect(result.attributes[2]!.kind).toBe('string');
    expect(result.attributes[3]!.kind).toBe('category');
  });

  it('handles scalar with null values', async () => {
    const input: PointsetInput = {
      x: [1, 2, 3],
      y: [4, 5, 6],
      z: [7, 8, 9],
      attributes: [{ name: 'grade', kind: 'scalar', values: [10.5, null, 30.5] }],
    };

    await expect(prepareForUpload(input)).resolves.toBeDefined();
  });

  it('generates unique UUID keys for each attribute', async () => {
    const input: PointsetInput = {
      x: [1, 2],
      y: [3, 4],
      z: [5, 6],
      attributes: [
        { name: 'a', kind: 'scalar', values: [10, 20] },
        { name: 'b', kind: 'scalar', values: [30, 40] },
      ],
    };

    const result = await prepareForUpload(input);

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
      const input: PointsetInput = {
        x: [1, 2],
        y: [3, 4],
        z: [5, 6],
        attributes: [
          { name: 'grade', kind: 'scalar', values: [10, 20] },
          { name: 'rock', kind: 'category', values: ['A', 'B'] },
        ],
      };

      const result = await prepareForUpload(input);

      const tags = result.blobs.map((b) => b.tag);
      expect(tags).toContain(`${uuid1}.values`);
      expect(tags).toContain(`${uuid2}.values`);
      expect(tags).toContain(`${uuid2}.lookup`);
    } finally {
      spy.mockRestore();
    }
  });
});
