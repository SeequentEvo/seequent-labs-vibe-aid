/**
 * Indices attribute decoder — single column of integer references.
 */

import type { Table } from "apache-arrow";

import type { AttributeDescriptor } from "@/api/evo/object-tables/types";
import { buildColumnMetadata, type DecodedColumn } from "@/api/evo/object-tables/column-meta";

import { columnAt } from "./helpers";

export function decodeIndices(
  descriptor: AttributeDescriptor,
  table: Table,
): DecodedColumn[] {
  const { name, key, attributeData } = descriptor;
  if (attributeData.kind !== "blob") {
    throw new Error("decodeIndices called with non-blob attribute data");
  }
  const array = columnAt(table, 0);

  return [{
    name,
    data: array,
    metadata: buildColumnMetadata({
      role: "attribute-value",
      source: key,
      blobRef: attributeData.blobs[0]!,
      attributeType: "indices",
    }),
  }];
}
