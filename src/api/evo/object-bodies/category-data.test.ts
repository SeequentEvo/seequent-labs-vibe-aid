import { describe, expect, it } from 'vitest';

import { categoryDataComponent } from './category-data';

const valuesBlobRef = { sha256: 'values-sha256' } as const;
const lookupBlobRef = { sha256: 'lookup-sha256' } as const;

describe('categoryDataComponent', () => {
  it('builds category data with correct values shape (int32, width 1) and lookup shape', () => {
    const result = categoryDataComponent({
      length: 100,
      valuesBlobRef,
      lookupBlobRef,
      lookupLength: 5,
    });

    expect(result.values).toEqual({
      data: 'values-sha256',
      length: 100,
      data_type: 'int32',
      width: 1,
    });

    expect(result.table).toEqual({
      data: 'lookup-sha256',
      length: 5,
      keys_data_type: 'int32',
      values_data_type: 'string',
    });
  });

  it('values length matches input', () => {
    const result = categoryDataComponent({
      length: 42,
      valuesBlobRef,
      lookupBlobRef,
      lookupLength: 3,
    });

    expect(result.values.length).toBe(42);
  });
});
