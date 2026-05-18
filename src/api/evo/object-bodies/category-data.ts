import type { ElementBlobRef } from './elements';
import { integerArrayElement, lookupTableElement } from './elements';

export interface CategoryDataInput {
  readonly length: number;
  readonly valuesBlobRef: ElementBlobRef;
  readonly lookupBlobRef: ElementBlobRef;
  readonly lookupLength: number;
}

export interface CategoryDataComponent {
  readonly values: { data: string; length: number; data_type: string; width?: number };
  readonly table: { data: string; length: number; keys_data_type: string; values_data_type: string };
}

/**
 * Build a category-data component (e.g. hole_id).
 * values = int32 array of codes, table = int32→string lookup.
 */
export function categoryDataComponent(input: CategoryDataInput): CategoryDataComponent {
  return {
    values: integerArrayElement(1, {
      length: input.length,
      blobRef: input.valuesBlobRef,
      dataType: 'int32',
    }),
    table: lookupTableElement({
      length: input.lookupLength,
      blobRef: input.lookupBlobRef,
    }),
  };
}
