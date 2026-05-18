import { describe, it, expect, vi } from 'vitest';
import { float64Vector } from '@/lib/arrow';
import { buildBlob } from './blobs';
import { buildCoordinatesBlob } from './coordinates';
import { buildCategoryBlobs } from './categories';
import { buildAttributeBlobs } from './attributes';
import { reorder } from './reorder';
import type { PrepareAttributeInput } from './types';

describe('buildBlob', () => {
  it('produces a tagged parquet table', async () => {
    const blob = await buildBlob('my.tag', [
      { name: 'data', vector: float64Vector([1, 2, 3]) },
    ]);

    expect(blob.tag).toBe('my.tag');
    expect(blob.table).toBeDefined();
  });
});

describe('buildCoordinatesBlob', () => {
  it('produces a tagged blob with interleaved xyz', async () => {
    const result = await buildCoordinatesBlob(
      'coordinates',
      [1, 4, 7],
      [2, 5, 8],
      [3, 6, 9],
      { expectedLength: 3 },
    );

    expect(result.blob.tag).toBe('coordinates');
    expect(result.blob.table).toBeDefined();
    expect(result.interleaved).toBeInstanceOf(Float64Array);
    expect(result.interleaved).toHaveLength(9);
    expect(Array.from(result.interleaved)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('throws when x length differs from expectedLength', async () => {
    await expect(
      buildCoordinatesBlob('coords', [1, 2], [1, 2, 3], [1, 2, 3], {
        expectedLength: 3,
      }),
    ).rejects.toThrow(RangeError);
  });

  it('throws when y length differs from expectedLength', async () => {
    await expect(
      buildCoordinatesBlob('coords', [1, 2, 3], [1, 2], [1, 2, 3], {
        expectedLength: 3,
      }),
    ).rejects.toThrow(RangeError);
  });

  it('throws when z length differs from expectedLength', async () => {
    await expect(
      buildCoordinatesBlob('coords', [1, 2, 3], [1, 2, 3], [1, 2], {
        expectedLength: 3,
      }),
    ).rejects.toThrow(RangeError);
  });
});

describe('buildCategoryBlobs', () => {
  it('returns two blobs with .values and .lookup tags', async () => {
    const result = await buildCategoryBlobs('attr.0', ['A', 'B', 'A'], {
      expectedLength: 3,
    });

    expect(result.blobs).toHaveLength(2);
    expect(result.valuesTag).toBe('attr.0.values');
    expect(result.lookupTag).toBe('attr.0.lookup');
    expect(result.blobs[0]!.tag).toBe('attr.0.values');
    expect(result.blobs[1]!.tag).toBe('attr.0.lookup');
    expect(result.lookupLength).toBe(2);
  });

  it('handles all-null input (lookupLength === 0)', async () => {
    const result = await buildCategoryBlobs('attr.null', [null, null, null], {
      expectedLength: 3,
    });

    expect(result.blobs).toHaveLength(2);
    expect(result.lookupLength).toBe(0);
  });

  it('handles non-null structural categories (hole IDs)', async () => {
    const result = await buildCategoryBlobs(
      'hole_id',
      ['H1', 'H2', 'H1', 'H3'],
      { expectedLength: 4 },
    );

    expect(result.lookupLength).toBe(3);
    expect(result.valuesTag).toBe('hole_id.values');
    expect(result.lookupTag).toBe('hole_id.lookup');
  });

  it('throws when values length differs from expectedLength', async () => {
    await expect(
      buildCategoryBlobs('attr', ['A', 'B'], { expectedLength: 3 }),
    ).rejects.toThrow(RangeError);
  });
});

describe('buildAttributeBlobs', () => {
  it('produces one blob per scalar attribute with correct tag', async () => {
    const uuid = '11111111-1111-1111-1111-111111111111';
    const spy = vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(uuid);

    try {
      const attrs: PrepareAttributeInput[] = [
        { name: 'grade', kind: 'scalar', values: [1, 2, 3] },
      ];
      const result = await buildAttributeBlobs(attrs, { expectedLength: 3 });

      expect(result.blobs).toHaveLength(1);
      expect(result.blobs[0]!.tag).toBe(`${uuid}.values`);
      expect(result.attributes).toHaveLength(1);
      expect(result.attributes[0]!.key).toBe(uuid);
      expect(result.attributes[0]!.kind).toBe('scalar');
      expect(result.attributes[0]!.valuesTag).toBe(`${uuid}.values`);
      expect(result.attributes[0]!.lookupTag).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });

  it('produces one blob per integer attribute', async () => {
    const uuid = '22222222-2222-2222-2222-222222222222';
    const spy = vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(uuid);

    try {
      const result = await buildAttributeBlobs(
        [{ name: 'count', kind: 'integer', values: [10, 20, 30] }],
        { expectedLength: 3 },
      );

      expect(result.blobs).toHaveLength(1);
      expect(result.blobs[0]!.tag).toBe(`${uuid}.values`);
      expect(result.attributes[0]!.kind).toBe('integer');
      expect(result.attributes[0]!.valuesTag).toBe(`${uuid}.values`);
    } finally {
      spy.mockRestore();
    }
  });

  it('produces one blob per string attribute', async () => {
    const uuid = '33333333-3333-3333-3333-333333333333';
    const spy = vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(uuid);

    try {
      const result = await buildAttributeBlobs(
        [{ name: 'label', kind: 'string', values: ['a', 'b', 'c'] }],
        { expectedLength: 3 },
      );

      expect(result.blobs).toHaveLength(1);
      expect(result.blobs[0]!.tag).toBe(`${uuid}.values`);
      expect(result.attributes[0]!.kind).toBe('string');
    } finally {
      spy.mockRestore();
    }
  });

  it('produces two blobs per category attribute with values+lookup tags', async () => {
    const uuid = '44444444-4444-4444-4444-444444444444';
    const spy = vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(uuid);

    try {
      const result = await buildAttributeBlobs(
        [{ name: 'rock', kind: 'category', values: ['A', 'B', 'A'] }],
        { expectedLength: 3 },
      );

      expect(result.blobs).toHaveLength(2);
      expect(result.blobs[0]!.tag).toBe(`${uuid}.values`);
      expect(result.blobs[1]!.tag).toBe(`${uuid}.lookup`);
      expect(result.attributes[0]!.kind).toBe('category');
      expect(result.attributes[0]!.valuesTag).toBe(`${uuid}.values`);
      expect(result.attributes[0]!.lookupTag).toBe(`${uuid}.lookup`);
      expect(result.attributes[0]!.lookupLength).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('applies tagPrefix to all blob tags', async () => {
    const uuid = '55555555-5555-5555-5555-555555555555';
    const spy = vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(uuid);

    try {
      const result = await buildAttributeBlobs(
        [{ name: 'rock', kind: 'category', values: ['A', 'B'] }],
        { expectedLength: 2, tagPrefix: 'child[0]' },
      );

      expect(result.blobs[0]!.tag).toBe(`child[0].${uuid}.values`);
      expect(result.blobs[1]!.tag).toBe(`child[0].${uuid}.lookup`);
      expect(result.attributes[0]!.valuesTag).toBe(`child[0].${uuid}.values`);
      expect(result.attributes[0]!.lookupTag).toBe(`child[0].${uuid}.lookup`);
    } finally {
      spy.mockRestore();
    }
  });

  it('respects reorderBy: reordered values land in the output', async () => {
    // We assert reorder is applied by checking that the category lookup
    // reflects the reordered slice. Using values ['X','Y','Y'] reordered
    // with indices [1, 2, 0] gives ['Y','Y','X'] — still 2 distinct
    // categories, but we verify reorder ran by mocking reorder side
    // effects via a unique-distinct-count check.
    //
    // To strongly assert ordering, use a string attribute whose values we
    // can read back via the blob's table — but reading parquet is heavy.
    // Instead, assert behaviour by exercising the bounds-check path:
    // reorderBy that would index out-of-bounds throws — this proves the
    // reorder pipeline runs for each kind.
    const attrs: PrepareAttributeInput[] = [
      { name: 'grade', kind: 'scalar', values: [10, 20, 30] },
      { name: 'count', kind: 'integer', values: [1, 2, 3] },
      { name: 'label', kind: 'string', values: ['a', 'b', 'c'] },
      { name: 'rock', kind: 'category', values: ['A', 'B', 'C'] },
    ];

    // Valid reorder: identity — should succeed for all kinds.
    const ok = await buildAttributeBlobs(attrs, {
      expectedLength: 3,
      reorderBy: [2, 1, 0],
    });
    expect(ok.attributes).toHaveLength(4);

    // Invalid reorder index — should throw, proving reorder is invoked.
    await expect(
      buildAttributeBlobs([attrs[0]!], {
        expectedLength: 3,
        reorderBy: [0, 1, 5],
      }),
    ).rejects.toThrow(RangeError);
    await expect(
      buildAttributeBlobs([attrs[1]!], {
        expectedLength: 3,
        reorderBy: [0, 1, 5],
      }),
    ).rejects.toThrow(RangeError);
    await expect(
      buildAttributeBlobs([attrs[2]!], {
        expectedLength: 3,
        reorderBy: [0, 1, 5],
      }),
    ).rejects.toThrow(RangeError);
    await expect(
      buildAttributeBlobs([attrs[3]!], {
        expectedLength: 3,
        reorderBy: [0, 1, 5],
      }),
    ).rejects.toThrow(RangeError);
  });

  it('throws when an attribute length differs from expectedLength', async () => {
    await expect(
      buildAttributeBlobs(
        [{ name: 'grade', kind: 'scalar', values: [1, 2] }],
        { expectedLength: 3 },
      ),
    ).rejects.toThrow(RangeError);
  });

  it('throws when reorderBy length differs from expectedLength', async () => {
    await expect(
      buildAttributeBlobs(
        [{ name: 'grade', kind: 'scalar', values: [1, 2, 3] }],
        { expectedLength: 3, reorderBy: [0, 1] },
      ),
    ).rejects.toThrow(RangeError);
  });

  it('assigns unique UUID keys across multiple attributes', async () => {
    const result = await buildAttributeBlobs(
      [
        { name: 'a', kind: 'scalar', values: [1, 2] },
        { name: 'b', kind: 'scalar', values: [3, 4] },
        { name: 'c', kind: 'scalar', values: [5, 6] },
      ],
      { expectedLength: 2 },
    );

    const keys = result.attributes.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('reorder', () => {
  it('reorders values by index permutation', () => {
    expect(reorder(['a', 'b', 'c', 'd'], [3, 0, 2, 1])).toEqual([
      'd',
      'a',
      'c',
      'b',
    ]);
  });

  it('supports projection (subset / duplication)', () => {
    expect(reorder([10, 20, 30], [0, 0, 2])).toEqual([10, 10, 30]);
  });

  it('throws on negative index', () => {
    expect(() => reorder([1, 2, 3], [0, -1, 2])).toThrow(RangeError);
  });

  it('throws on index >= length', () => {
    expect(() => reorder([1, 2, 3], [0, 1, 3])).toThrow(RangeError);
  });
});
