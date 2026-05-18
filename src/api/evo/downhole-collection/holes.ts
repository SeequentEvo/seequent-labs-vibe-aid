export interface HoleDictionary {
  /** Ordered unique hole IDs from the collar CSV. */
  readonly ids: readonly string[];
  /** Map from hole_id string to 0-based index. */
  readonly indexMap: ReadonlyMap<string, number>;
}

/** Build a hole dictionary from collar hole_id values (order of first appearance). */
export function buildHoleDictionary(
  holeIds: readonly string[],
): HoleDictionary {
  const indexMap = new Map<string, number>();
  const ids: string[] = [];

  for (const id of holeIds) {
    if (!indexMap.has(id)) {
      indexMap.set(id, ids.length);
      ids.push(id);
    }
  }

  return { ids, indexMap };
}

export interface HoleChunk {
  readonly holeIndex: number;
  readonly offset: bigint;
  readonly count: bigint;
}

/**
 * Group and sort rows by hole dictionary order.
 * Returns the sorted row indices and computed hole chunks.
 *
 * @param rowHoleIds - hole_id value for each row
 * @param dictionary - the canonical hole dictionary (from collars)
 * @param sortKeyFn - function to extract sort key from row index (e.g. distance or from value)
 * @throws if a row references a hole_id not in the dictionary
 */
export function groupAndSortRows(
  rowHoleIds: readonly string[],
  dictionary: HoleDictionary,
  sortKeyFn: (rowIndex: number) => number,
): { sortedIndices: number[]; chunks: HoleChunk[] } {
  // Group row indices by hole dictionary index
  const groups = new Map<number, number[]>();

  for (let i = 0; i < rowHoleIds.length; i++) {
    const holeId = rowHoleIds[i]!;
    const holeIndex = dictionary.indexMap.get(holeId);
    if (holeIndex === undefined) {
      throw new Error(
        `Row ${String(i)}: hole_id "${holeId}" not found in hole dictionary`,
      );
    }
    let group = groups.get(holeIndex);
    if (!group) {
      group = [];
      groups.set(holeIndex, group);
    }
    group.push(i);
  }

  // Sort groups by hole dictionary order, then by sort key within each group
  const sortedHoleIndices = [...groups.keys()].sort((a, b) => a - b);

  const sortedIndices: number[] = [];
  const chunks: HoleChunk[] = [];
  let offset = 0n;

  for (const holeIndex of sortedHoleIndices) {
    const group = groups.get(holeIndex)!;
    group.sort((a, b) => sortKeyFn(a) - sortKeyFn(b));

    chunks.push({
      holeIndex,
      offset,
      count: BigInt(group.length),
    });

    sortedIndices.push(...group);
    offset += BigInt(group.length);
  }

  return { sortedIndices, chunks };
}
