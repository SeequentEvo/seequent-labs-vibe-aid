import type { Table as ParquetTable } from '@/api/evo/blob/parquetCodec';
import type { AttributeKind } from '@/api/evo/object-bodies/attributes';

export type { AttributeKind };

/** A tagged parquet table ready for blob staging. */
export interface PreparedBlob {
  readonly tag: string;
  readonly table: ParquetTable;
}

/**
 * Metadata about a prepared attribute, including the exact blob tags the
 * body builder should resolve. Tags are produced by prepare; body code
 * never reconstructs them from `key`.
 */
export interface PreparedAttribute {
  readonly name: string;
  readonly key: string;
  readonly kind: AttributeKind;
  readonly length: number;
  readonly valuesTag: string;
  /** Present only when `kind === 'category'`. */
  readonly lookupTag?: string;
  /** Present only when `kind === 'category'`. */
  readonly lookupLength?: number;
}

/**
 * Typed user input for a single attribute column. Discriminated by `kind`.
 *
 * Named distinctly from `object-bodies/attributes::AttributeInput` (which is
 * the body-builder input with blob refs) to keep the two roles unambiguous.
 */
export type PrepareAttributeInput =
  | { readonly name: string; readonly kind: 'scalar'; readonly values: readonly (number | null)[] }
  | { readonly name: string; readonly kind: 'integer'; readonly values: readonly (number | null)[] }
  | { readonly name: string; readonly kind: 'string'; readonly values: readonly (string | null)[] }
  | { readonly name: string; readonly kind: 'category'; readonly values: readonly (string | null)[] };
