/**
 * Shared helper for decoder modules — extract a column vector by index.
 */

import type { Table, Vector } from "apache-arrow";

/** Get a column vector from a table by index, throwing if missing. */
export function columnAt(table: Table, index: number): Vector {
  const col = table.getChildAt(index);
  if (col == null) throw new Error(`No column at index ${String(index)}`);
  return col;
}
