import { describe, expect, it } from "vitest";
import { tableFromIPC } from "apache-arrow";

import { buildParquetTable } from "./__tests__/buildParquetTable";
import { decodeParquet, encodeParquet, sha256Hex } from "./parquetCodec";

describe("parquetCodec", () => {
  it("round-trips a small table preserving column values", async () => {
    const table = await buildParquetTable();
    const bytes = await encodeParquet(table);
    const decoded = await decodeParquet(bytes);

    const ipc = decoded.intoIPCStream();
    const arrowTable = tableFromIPC(ipc);

    expect(arrowTable.schema.fields.map((f) => f.name)).toEqual(["id", "name"]);
    expect(arrowTable.numRows).toBe(3);
    const idChild = arrowTable.getChild("id");
    const nameChild = arrowTable.getChild("name");
    expect(idChild).not.toBeNull();
    expect(nameChild).not.toBeNull();
    expect(Array.from(idChild!.toArray() as Int32Array)).toEqual([1, 2, 3]);
    expect(Array.from(nameChild!.toArray() as string[])).toEqual(["a", "b", "c"]);
  });

  it("produces a file with the PAR1 magic header and footer", async () => {
    const table = await buildParquetTable();
    const bytes = await encodeParquet(table);
    const head = String.fromCharCode(...bytes.slice(0, 4));
    const tail = String.fromCharCode(...bytes.slice(bytes.length - 4));
    expect(head).toBe("PAR1");
    expect(tail).toBe("PAR1");
  });

  it("computes SHA-256 of [1,2,3] correctly", async () => {
    const hex = await sha256Hex(new Uint8Array([1, 2, 3]));
    expect(hex).toBe(
      "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
    );
  });
});
