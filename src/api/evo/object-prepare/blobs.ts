import { buildArrowTable, arrowToParquetTable, type NamedColumn } from '@/lib/arrow';
import type { PreparedBlob } from './types';

/**
 * Build a tagged parquet blob from named Arrow columns.
 *
 * Thin wrapper around `buildArrowTable` + `arrowToParquetTable` that
 * captures the universal `{ tag, table }` shape used by every blob.
 */
export async function buildBlob(
  tag: string,
  columns: readonly NamedColumn[],
): Promise<PreparedBlob> {
  const table = buildArrowTable(columns);
  return { tag, table: await arrowToParquetTable(table) };
}
