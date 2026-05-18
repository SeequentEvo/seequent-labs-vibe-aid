import { makeBuilder, Int32, Utf8 } from 'apache-arrow';
import { encodeCategoryColumn } from '@/lib/arrow';
import { buildBlob } from './blobs';
import type { PreparedBlob } from './types';

export interface CategoryBlobsResult {
  readonly blobs: readonly PreparedBlob[];
  readonly valuesTag: string;
  readonly lookupTag: string;
  readonly lookupLength: number;
}

/**
 * Encode a category column into the pair of blobs the Evo object schema
 * expects: an int32 `codes` blob (tag `${tagBase}.values`) and a lookup
 * blob (tag `${tagBase}.lookup`) mapping codes to category strings.
 *
 * Handles both nullable category attributes and non-null structural
 * categories such as `hole_id`.
 *
 * @throws If `values.length !== expectedLength`.
 */
export async function buildCategoryBlobs(
  tagBase: string,
  values: readonly (string | null)[],
  options: { readonly expectedLength: number },
): Promise<CategoryBlobsResult> {
  const { expectedLength } = options;
  if (values.length !== expectedLength) {
    throw new RangeError(
      `buildCategoryBlobs(${tagBase}): expected length ${String(expectedLength)}, got ${String(values.length)}`,
    );
  }

  const valuesTag = `${tagBase}.values`;
  const lookupTag = `${tagBase}.lookup`;

  const encoded = encodeCategoryColumn(values);

  const valuesBlob = await buildBlob(valuesTag, [
    { name: 'data', vector: encoded.codes },
  ]);

  const keyBuilder = makeBuilder({ type: new Int32() });
  for (const k of encoded.lookup.keys) keyBuilder.append(k);
  const valBuilder = makeBuilder({ type: new Utf8() });
  for (const v of encoded.lookup.values) valBuilder.append(v);

  const lookupBlob = await buildBlob(lookupTag, [
    { name: 'key', vector: keyBuilder.finish().toVector() },
    { name: 'value', vector: valBuilder.finish().toVector() },
  ]);

  return {
    blobs: [valuesBlob, lookupBlob],
    valuesTag,
    lookupTag,
    lookupLength: encoded.lookup.values.length,
  };
}
