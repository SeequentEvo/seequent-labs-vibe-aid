/**
 * Shared test helper: build a small parquet `Table` from JS arrays.
 *
 * Relies on `parquetTestSetup.ts` having already initialised parquet-wasm.
 */

import { tableFromArrays, tableToIPC } from "apache-arrow";

import type { Table } from "@/api/evo/blob/parquetCodec";

export interface BuildTableOptions {
  ids?: Int32Array;
  names?: string[];
}

export async function buildParquetTable(
  options: BuildTableOptions = {},
): Promise<Table> {
  const ids = options.ids ?? Int32Array.from([1, 2, 3]);
  const names = options.names ?? ["a", "b", "c"];
  const arrowTable = tableFromArrays({ id: ids, name: names });
  const ipc = tableToIPC(arrowTable, "stream");
  const mod = await import("parquet-wasm/esm");
  return mod.Table.fromIPCStream(ipc);
}
