import { describe, it, expect } from 'vitest';
import { buildHoleDictionary, groupAndSortRows } from './holes';

describe('buildHoleDictionary', () => {
  it('preserves order of first appearance', () => {
    const dict = buildHoleDictionary(['B', 'A', 'C', 'A', 'B']);
    expect(dict.ids).toEqual(['B', 'A', 'C']);
    expect(dict.indexMap.get('B')).toBe(0);
    expect(dict.indexMap.get('A')).toBe(1);
    expect(dict.indexMap.get('C')).toBe(2);
  });

  it('deduplicates', () => {
    const dict = buildHoleDictionary(['X', 'X', 'X']);
    expect(dict.ids).toEqual(['X']);
    expect(dict.indexMap.size).toBe(1);
  });

  it('handles a single hole', () => {
    const dict = buildHoleDictionary(['HOLE1']);
    expect(dict.ids).toEqual(['HOLE1']);
    expect(dict.indexMap.get('HOLE1')).toBe(0);
  });
});

describe('groupAndSortRows', () => {
  const dictionary = buildHoleDictionary(['H1', 'H2', 'H3']);

  it('groups rows by hole and sorts within each hole', () => {
    //            row 0   row 1   row 2   row 3   row 4
    const ids = ['H2',   'H1',   'H2',   'H1',   'H3'];
    const keys = [20,     10,     15,     5,      100];

    const result = groupAndSortRows(ids, dictionary, (i) => keys[i]!);

    // H1 rows (1,3) sorted by key: 3(5), 1(10) → [3,1]
    // H2 rows (0,2) sorted by key: 2(15), 0(20) → [2,0]
    // H3 rows (4) → [4]
    expect(result.sortedIndices).toEqual([3, 1, 2, 0, 4]);

    expect(result.chunks).toHaveLength(3);
    expect(result.chunks[0]).toEqual({ holeIndex: 0, offset: 0n, count: 2n });
    expect(result.chunks[1]).toEqual({ holeIndex: 1, offset: 2n, count: 2n });
    expect(result.chunks[2]).toEqual({ holeIndex: 2, offset: 4n, count: 1n });
  });

  it('throws on unknown hole_id', () => {
    expect(() =>
      groupAndSortRows(['UNKNOWN'], dictionary, () => 0),
    ).toThrow('hole_id "UNKNOWN" not found in hole dictionary');
  });

  it('returns no chunk for holes with no rows', () => {
    // Only H2 has rows — H1 and H3 get no chunks
    const result = groupAndSortRows(
      ['H2', 'H2'],
      dictionary,
      (i) => i,
    );
    expect(result.sortedIndices).toEqual([0, 1]);
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]).toEqual({ holeIndex: 1, offset: 0n, count: 2n });
  });

  it('all rows for one hole gives single chunk', () => {
    const result = groupAndSortRows(
      ['H1', 'H1', 'H1'],
      dictionary,
      (i) => [30, 10, 20][i]!,
    );
    expect(result.sortedIndices).toEqual([1, 2, 0]);
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]).toEqual({ holeIndex: 0, offset: 0n, count: 3n });
  });

  it('builds contiguous offsets', () => {
    const ids = ['H3', 'H1', 'H3', 'H1', 'H2'];
    const result = groupAndSortRows(ids, dictionary, (i) => i);

    let expectedOffset = 0n;
    for (const chunk of result.chunks) {
      expect(chunk.offset).toBe(expectedOffset);
      expectedOffset += chunk.count;
    }
    expect(expectedOffset).toBe(BigInt(ids.length));
  });
});
