import {
  nullableFloat64Vector,
  nullableInt64Vector,
  nullableUtf8Vector,
} from '@/lib/arrow';
import { buildBlob } from './blobs';
import { buildCategoryBlobs } from './categories';
import { reorder } from './reorder';
import type { PreparedBlob, PreparedAttribute, PrepareAttributeInput } from './types';

export interface AttributeBlobsResult {
  readonly blobs: readonly PreparedBlob[];
  readonly attributes: readonly PreparedAttribute[];
}

export interface BuildAttributeBlobsOptions {
  /** Row count of the parent collection — every attribute must match. */
  readonly expectedLength: number;
  /** Optional prefix prepended to each blob tag (e.g. `child[0]`). */
  readonly tagPrefix?: string;
  /** Optional reorder vector applied to each attribute's values. */
  readonly reorderBy?: readonly number[];
}

/**
 * Produce blobs + metadata for a list of typed attribute columns.
 *
 * Each attribute receives a freshly minted `key` (uuid). For scalar /
 * integer / string kinds, one `<prefix>.<key>.values` blob is produced.
 * Category kinds additionally produce a `<prefix>.<key>.lookup` blob.
 *
 * The returned `PreparedAttribute.valuesTag` (and `lookupTag` for
 * categories) is the exact tag emitted — body builders should read these
 * rather than reconstructing tag strings from `key`.
 *
 * @throws If any attribute's `values.length !== expectedLength`, or if
 *   `reorderBy.length !== expectedLength`.
 */
export async function buildAttributeBlobs(
  attrs: readonly PrepareAttributeInput[],
  options: BuildAttributeBlobsOptions,
): Promise<AttributeBlobsResult> {
  const { expectedLength, tagPrefix, reorderBy } = options;

  if (reorderBy && reorderBy.length !== expectedLength) {
    throw new RangeError(
      `buildAttributeBlobs: reorderBy length ${String(reorderBy.length)} !== expectedLength ${String(expectedLength)}`,
    );
  }

  const blobs: PreparedBlob[] = [];
  const attributes: PreparedAttribute[] = [];
  const prefix = tagPrefix ? `${tagPrefix}.` : '';

  for (const attr of attrs) {
    if (attr.values.length !== expectedLength) {
      throw new RangeError(
        `buildAttributeBlobs: attribute "${attr.name}" length ${String(attr.values.length)} !== expectedLength ${String(expectedLength)}`,
      );
    }

    const key = crypto.randomUUID();
    const tagBase = `${prefix}${key}`;

    switch (attr.kind) {
      case 'scalar': {
        const values = reorderBy ? reorder(attr.values, reorderBy) : attr.values;
        const valuesTag = `${tagBase}.values`;
        blobs.push(await buildBlob(valuesTag, [{ name: 'data', vector: nullableFloat64Vector(values) }]));
        attributes.push({ name: attr.name, key, kind: 'scalar', length: expectedLength, valuesTag });
        break;
      }
      case 'integer': {
        const values = reorderBy ? reorder(attr.values, reorderBy) : attr.values;
        const valuesTag = `${tagBase}.values`;
        blobs.push(await buildBlob(valuesTag, [{ name: 'data', vector: nullableInt64Vector(values) }]));
        attributes.push({ name: attr.name, key, kind: 'integer', length: expectedLength, valuesTag });
        break;
      }
      case 'string': {
        const values = reorderBy ? reorder(attr.values, reorderBy) : attr.values;
        const valuesTag = `${tagBase}.values`;
        blobs.push(await buildBlob(valuesTag, [{ name: 'data', vector: nullableUtf8Vector(values) }]));
        attributes.push({ name: attr.name, key, kind: 'string', length: expectedLength, valuesTag });
        break;
      }
      case 'category': {
        const values = reorderBy ? reorder(attr.values, reorderBy) : attr.values;
        const cat = await buildCategoryBlobs(tagBase, values, { expectedLength });
        blobs.push(...cat.blobs);
        attributes.push({
          name: attr.name,
          key,
          kind: 'category',
          length: expectedLength,
          valuesTag: cat.valuesTag,
          lookupTag: cat.lookupTag,
          lookupLength: cat.lookupLength,
        });
        break;
      }
    }
  }

  return { blobs, attributes };
}
