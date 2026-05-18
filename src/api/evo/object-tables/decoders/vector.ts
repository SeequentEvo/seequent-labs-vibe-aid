/**
 * Vector (multi-column) attribute decoder.
 */

import type { Table } from "apache-arrow";

import type { AttributeDescriptor } from "@/api/evo/object-tables/types";
import { buildColumnMetadata, type DecodedColumn } from "@/api/evo/object-tables/column-meta";
import { buildNullMask, applyNullMask } from "@/api/evo/object-tables/null-mask";

import { columnAt } from "./helpers";

export function decodeVector(
  descriptor: AttributeDescriptor,
  table: Table,
): DecodedColumn[] {
  const width = descriptor.columns.length;
  if (descriptor.attributeData.kind !== "blob") {
    throw new Error("decodeVector called with non-blob attribute data");
  }
  const blobRef = descriptor.attributeData.blobs[0]!;
  const { nanDescription } = descriptor;
  const result: DecodedColumn[] = [];

  for (let i = 0; i < width; i++) {
    let vector = columnAt(table, i);
    let nullsApplied = false;
    if (nanDescription) {
      const sentinels = new Set(nanDescription.values);
      const mask = buildNullMask(vector, sentinels, true);
      if (mask) {
        vector = applyNullMask(vector, mask);
        nullsApplied = true;
      }
    }
    result.push({
      name: descriptor.columns[i]!,
      data: vector,
      metadata: buildColumnMetadata({
        role: "attribute-value",
        source: descriptor.key,
        blobRef,
        attributeType: "vector",
        nullsApplied,
      }),
    });
  }

  return result;
}
