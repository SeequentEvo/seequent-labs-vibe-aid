/**
 * Category attribute decoder — emits a Dictionary<Utf8, Int> Vector.
 *
 * Uses makeVector (typed-array path) instead of Builders to avoid
 * the CSP-unsafe `new Function(...)` codegen in Arrow's DictionaryBuilder.
 */

import { Dictionary, Int, Int32, makeVector, type Table, type Vector } from "apache-arrow";

import type { BlobRef } from "@/api/evo/blob";

import type { AttributeDescriptor, NanDescription } from "@/api/evo/object-tables/types";
import { buildColumnMetadata, type DecodedColumn } from "@/api/evo/object-tables/column-meta";

import { columnAt } from "./helpers";

/**
 * Core join: integer codes + lookup-table → Dictionary<Utf8, Int32> vector.
 *
 * Shared by:
 * - attribute-path category decoding (via `decodeCategory`)
 * - schema-fixed category-data fields (via `decodeCategoryColumn` in identity.ts)
 *
 * Output indices are always Int32 — they are positions into the lookup table
 * (bounded by lookup row count) and Int32 dictionary indices avoid BigInt
 * propagation into Arrow's variable-width getters (getUtf8 cannot index with
 * BigInt). The Dictionary's *value* type follows the lookup labels' type
 * (typically Utf8).
 */
export function joinCategoryDictionary(
  codesVector: Vector,
  lookupTable: Table,
  sentinels?: NanDescription | null,
): Vector {
  if (!(codesVector.type instanceof Int))
    throw new Error("Category codes must be an Int type");

  const lookupKeysVector = columnAt(lookupTable, 0);
  const labelsVector = columnAt(lookupTable, 1);

  // Canonical key type: bigint. JS Map uses SameValueZero, so `5 !== 5n`; mixing
  // int32 codes with int64 lookup keys (or vice versa) silently misses every
  // match. Normalising both sides to bigint makes the join type-stable across
  // all integer widths Arrow may surface.
  const keyMap = new Map<bigint, number>();
  for (let i = 0; i < lookupKeysVector.length; i++) {
    const raw = lookupKeysVector.get(i) as number | bigint;
    const k = BigInt(raw);
    if (keyMap.has(k)) console.warn(`Duplicate category lookup key: ${String(k)}`);
    keyMap.set(k, i);
  }

  const sentinelSet = sentinels
    ? new Set<bigint>(sentinels.values.map((v) => BigInt(v)))
    : new Set<bigint>();

  // Dictionary indices are always Int32 (lookup positions fit comfortably).
  const indices = new Int32Array(codesVector.length);
  const nullBitmap = new Uint8Array(Math.ceil(codesVector.length / 8));
  nullBitmap.fill(0xff);
  let hasNull = false;

  for (let i = 0; i < codesVector.length; i++) {
    const code = codesVector.get(i) as number | bigint | null | undefined;

    if (code == null) {
      nullBitmap[i >> 3]! &= ~(1 << (i & 7));
      indices[i] = 0;
      hasNull = true;
      continue;
    }

    const key = BigInt(code);

    if (sentinelSet.has(key)) {
      nullBitmap[i >> 3]! &= ~(1 << (i & 7));
      indices[i] = 0;
      hasNull = true;
    } else {
      const pos = keyMap.get(key);
      if (pos === undefined) {
        nullBitmap[i >> 3]! &= ~(1 << (i & 7));
        indices[i] = 0;
        hasNull = true;
      } else {
        indices[i] = pos;
      }
    }
  }

  return makeVector({
    type: new Dictionary(labelsVector.type, new Int32()),
    length: codesVector.length,
    data: indices,
    dictionary: labelsVector,
    nullBitmap: hasNull ? nullBitmap : undefined,
  });
}

export function decodeCategory(
  descriptor: AttributeDescriptor,
  valuesTable: Table,
  allTables: ReadonlyMap<BlobRef, Table>,
): DecodedColumn[] {
  const { name, key, attributeData, nanDescription } = descriptor;
  if (attributeData.kind !== "blob") {
    throw new Error("decodeCategory called with non-blob attribute data");
  }
  const { blobs } = attributeData;
  const valueBlobRef = blobs[0]!;

  const codesVector = columnAt(valuesTable, 0);

  if (blobs.length < 2) throw new Error("Category attribute requires a lookup blob");
  const lookupBlobRef = blobs[1]!;
  const lookupTable = allTables.get(lookupBlobRef);
  if (!lookupTable) throw new Error(`Missing lookup table for blob ${lookupBlobRef}`);

  const dictVector = joinCategoryDictionary(codesVector, lookupTable, nanDescription);

  return [{
    name,
    data: dictVector,
    metadata: buildColumnMetadata({
      role: "attribute-value",
      source: key,
      blobRef: valueBlobRef,
      attributeType: "category",
    }),
  }];
}
