import type { ArrayTableInfo, LookupTableInfo, ElementBlobRef } from './elements';
import {
  floatArrayElement,
  integerArrayElement,
  stringArrayElement,
  lookupTableElement,
} from './elements';

export type AttributeKind = 'scalar' | 'integer' | 'string' | 'category';

/** Input for building an attribute entry. */
export interface AttributeInput {
  readonly name: string;
  readonly key: string;
  readonly kind: AttributeKind;
  readonly length: number;
  readonly valuesBlobRef: ElementBlobRef;
  /** Required for category; ignored for other kinds. */
  readonly lookupBlobRef?: ElementBlobRef;
  /** Required for category: number of distinct categories in the lookup table. */
  readonly lookupLength?: number;
}

/** Wire shape for an attribute entry in the object body. */
export interface AttributeEntry {
  readonly name: string;
  readonly key: string;
  readonly attribute_type: string;
  readonly nan_description?: { readonly values: readonly [] };
  readonly values: ArrayTableInfo;
  readonly table?: LookupTableInfo;
}

const NAN_DESCRIPTION = { values: [] as const } as const;

function buildValues(input: AttributeInput): ArrayTableInfo {
  const { kind, length, valuesBlobRef: blobRef } = input;
  switch (kind) {
    case 'scalar':
      return floatArrayElement(1, { length, blobRef });
    case 'integer':
      return integerArrayElement(1, { length, blobRef, dataType: 'int64' });
    case 'string':
      return stringArrayElement({ length, blobRef });
    case 'category':
      return integerArrayElement(1, { length, blobRef, dataType: 'int32' });
  }
}

/**
 * Build an attribute entry for the object body.
 *
 * @throws If kind is 'category' but lookupBlobRef or lookupLength is missing
 */
export function attributeEntry(input: AttributeInput): AttributeEntry {
  const { name, key, kind } = input;

  const values = buildValues(input);

  const base = {
    name,
    key,
    attribute_type: kind,
    values,
  };

  if (kind === 'category') {
    if (!input.lookupBlobRef || input.lookupLength == null) {
      throw new Error(
        'Category attributes require lookupBlobRef and lookupLength',
      );
    }
    return {
      ...base,
      nan_description: NAN_DESCRIPTION,
      table: lookupTableElement({
        length: input.lookupLength,
        blobRef: input.lookupBlobRef,
      }),
    };
  }

  if (kind === 'string') {
    return base;
  }

  // scalar | integer
  return { ...base, nan_description: NAN_DESCRIPTION };
}
