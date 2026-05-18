/**
 * Reorder a column by a list of source indices.
 * Result[i] === values[indices[i]].
 *
 * @throws If any index is out of bounds for `values`.
 */
export function reorder<T>(
  values: readonly T[],
  indices: readonly number[],
): T[] {
  const result = new Array<T>(indices.length);
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i]!;
    if (idx < 0 || idx >= values.length) {
      throw new RangeError(
        `reorder: index ${String(idx)} out of bounds for column of length ${String(values.length)}`,
      );
    }
    result[i] = values[idx]!;
  }
  return result;
}
