/**
 * Simple (single-column) attribute decoder — scalar, bool, color, string,
 * integer, date_time.
 */

import type { Table } from "apache-arrow";

import type { BlobRef } from "@/api/evo/blob";

import type { NanDescription, SupportedAttributeType } from "@/api/evo/object-tables/types";
import { buildColumnMetadata, type DecodedColumn } from "@/api/evo/object-tables/column-meta";
import { buildNullMask, applyNullMask } from "@/api/evo/object-tables/null-mask";

import { columnAt } from "./helpers";

export function decodeSimple(
  name: string,
  source: string,
  blobRef: BlobRef,
  nanDesc: NanDescription | null,
  attributeType: SupportedAttributeType,
  table: Table,
): DecodedColumn[] {
  const isContinuous = attributeType === "scalar";
  let vector = columnAt(table, 0);
  let nullsApplied = false;
  if (nanDesc) {
    const sentinels = new Set(nanDesc.values);
    const mask = buildNullMask(vector, sentinels, isContinuous);
    if (mask) {
      vector = applyNullMask(vector, mask);
      nullsApplied = true;
    }
  }
  return [{
    name,
    data: vector,
    metadata: buildColumnMetadata({
      role: "attribute-value",
      source,
      blobRef,
      attributeType,
      nullsApplied,
    }),
  }];
}
