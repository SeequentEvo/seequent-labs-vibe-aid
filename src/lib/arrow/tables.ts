import { Table, tableToIPC } from "apache-arrow";
import type { Vector, Table as ArrowTable } from "apache-arrow";
import { getParquetWasmModule } from "@/api/evo/blob/parquetCodec";
import type { Table as ParquetTable } from "@/api/evo/blob/parquetCodec";

/** A named column (Vector from apache-arrow). */
export interface NamedColumn {
  readonly name: string;
  readonly vector: Vector;
}

/**
 * Build an Apache Arrow Table from named Vector columns.
 *
 * Uses the Table constructor (not `makeTable`, which expects raw TypedArrays)
 * so each Vector's nullability / validity bitmap is preserved as-is.
 */
export function buildArrowTable(columns: readonly NamedColumn[]): ArrowTable {
  const record: Record<string, Vector> = {};
  for (const col of columns) {
    record[col.name] = col.vector;
  }
  return new Table(record);
}

/**
 * Convert an Arrow Table to a parquet-wasm Table via the IPC stream bridge.
 *
 * Uses the same pattern as the existing codebase: `tableToIPC(t, 'stream')` →
 * `parquet-wasm.Table.fromIPCStream(ipc)`.
 */
export async function arrowToParquetTable(
  table: ArrowTable,
): Promise<ParquetTable> {
  const ipc = tableToIPC(table, "stream");
  const mod = await getParquetWasmModule();
  return mod.Table.fromIPCStream(ipc);
}
