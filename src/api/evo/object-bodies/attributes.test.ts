import { describe, it, expect } from 'vitest';

import type { AttributeInput } from './attributes';
import { attributeEntry } from './attributes';

const blobRef = { sha256: 'abc123' } as const;
const lookupBlobRef = { sha256: 'lookup456' } as const;

function makeInput(
  overrides: Partial<AttributeInput> & Pick<AttributeInput, 'kind'>,
): AttributeInput {
  return {
    name: 'test_attr',
    key: '00000000-0000-4000-8000-000000000001',
    length: 10,
    valuesBlobRef: blobRef,
    ...overrides,
  };
}

describe('attributeEntry', () => {
  it('scalar → nan_description, float64, width 1, no table', () => {
    const result = attributeEntry(makeInput({ kind: 'scalar' }));

    expect(result.attribute_type).toBe('scalar');
    expect(result.nan_description).toEqual({ values: [] });
    expect(result.values.data_type).toBe('float64');
    expect(result.values.width).toBe(1);
    expect(result).not.toHaveProperty('table');
  });

  it('integer → nan_description, int64, no table', () => {
    const result = attributeEntry(makeInput({ kind: 'integer' }));

    expect(result.attribute_type).toBe('integer');
    expect(result.nan_description).toEqual({ values: [] });
    expect(result.values.data_type).toBe('int64');
    expect(result).not.toHaveProperty('table');
  });

  it('string → NO nan_description, string data_type, no table', () => {
    const result = attributeEntry(makeInput({ kind: 'string' }));

    expect(result.attribute_type).toBe('string');
    expect('nan_description' in result).toBe(false);
    expect(result.values.data_type).toBe('string');
    expect(result).not.toHaveProperty('table');
  });

  it('category → nan_description, int32 values, has table', () => {
    const result = attributeEntry(
      makeInput({
        kind: 'category',
        lookupBlobRef,
        lookupLength: 5,
      }),
    );

    expect(result.attribute_type).toBe('category');
    expect(result.nan_description).toEqual({ values: [] });
    expect(result.values.data_type).toBe('int32');
    expect(result.table).toBeDefined();
    expect(result.table?.keys_data_type).toBe('int32');
    expect(result.table?.values_data_type).toBe('string');
    expect(result.table?.length).toBe(5);
    expect(result.table?.data).toBe('lookup456');
  });

  it('category without lookupBlobRef throws', () => {
    expect(() => attributeEntry(makeInput({ kind: 'category' }))).toThrow(
      /lookupBlobRef/,
    );
  });

  it('category without lookupLength throws', () => {
    expect(() =>
      attributeEntry(makeInput({ kind: 'category', lookupBlobRef })),
    ).toThrow(/lookupLength/);
  });

  it('passes name and key through unchanged', () => {
    const result = attributeEntry(
      makeInput({ kind: 'scalar', name: 'grade', key: 'my-key' }),
    );

    expect(result.name).toBe('grade');
    expect(result.key).toBe('my-key');
  });

  it('nan_description presence matches spec for every kind', () => {
    const spec: Record<string, boolean> = {
      scalar: true,
      integer: true,
      category: true,
      string: false,
    };

    for (const [kind, shouldHaveNan] of Object.entries(spec)) {
      const input = makeInput({
        kind: kind as AttributeInput['kind'],
        ...(kind === 'category' && { lookupBlobRef, lookupLength: 3 }),
      });
      const result = attributeEntry(input);

      expect('nan_description' in result).toBe(shouldHaveNan);
    }
  });
});
