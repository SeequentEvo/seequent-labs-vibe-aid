import { describe, expect, it } from 'vitest';

import {
  boolArrayElement,
  floatArrayElement,
  holeChunksElement,
  integerArrayElement,
  lookupTableElement,
  stringArrayElement,
} from './elements';

const blobRef = { sha256: 'abc123def456' } as const;

describe('floatArrayElement', () => {
  it('includes width when width > 1', () => {
    const result = floatArrayElement(3, { length: 100, blobRef });

    expect(result).toEqual({
      data: 'abc123def456',
      length: 100,
      data_type: 'float64',
      width: 3,
    });
  });

  it('always includes width === 1 (required by float-array-1 schema)', () => {
    const result = floatArrayElement(1, { length: 50, blobRef });

    expect(result.data).toBe('abc123def456');
    expect(result.length).toBe(50);
    expect(result.data_type).toBe('float64');
    expect(result.width).toBe(1);
  });
});

describe('integerArrayElement', () => {
  it('produces int32 with width === 1 (required by integer-array-1 schema)', () => {
    const result = integerArrayElement(1, {
      length: 10,
      blobRef,
      dataType: 'int32',
    });

    expect(result.data_type).toBe('int32');
    expect(result.width).toBe(1);
  });

  it('produces int64 with width === 1 (required by integer-array-1 schema)', () => {
    const result = integerArrayElement(1, {
      length: 10,
      blobRef,
      dataType: 'int64',
    });

    expect(result.data_type).toBe('int64');
    expect(result.width).toBe(1);
  });

  it('includes width when width > 1', () => {
    const result = integerArrayElement(2, {
      length: 20,
      blobRef,
      dataType: 'int32',
    });

    expect(result.width).toBe(2);
  });
});

describe('stringArrayElement', () => {
  it('produces string data_type with no width', () => {
    const result = stringArrayElement({ length: 5, blobRef });

    expect(result.data_type).toBe('string');
    expect(result.data).toBe('abc123def456');
    expect(result.length).toBe(5);
    expect('width' in result).toBe(false);
  });
});

describe('boolArrayElement', () => {
  it('returns correct shape with data_type bool and no width', () => {
    const result = boolArrayElement({ length: 10, blobRef });

    expect(result).toEqual({
      data: 'abc123def456',
      length: 10,
      data_type: 'bool',
    });
    expect('width' in result).toBe(false);
  });
});

describe('holeChunksElement', () => {
  it('returns correct shape with width 3 and composite data_type', () => {
    const result = holeChunksElement({ length: 5, blobRef });

    expect(result).toEqual({
      data: 'abc123def456',
      length: 5,
      width: 3,
      data_type: 'int32/uint64/uint64',
    });
  });
});

describe('lookupTableElement', () => {
  it('uses default key and value types', () => {
    const result = lookupTableElement({ length: 42, blobRef });

    expect(result).toEqual({
      data: 'abc123def456',
      length: 42,
      keys_data_type: 'int32',
      values_data_type: 'string',
    });
  });

  it('uses custom key and value types', () => {
    const result = lookupTableElement({
      length: 10,
      blobRef,
      keysDataType: 'uint64',
      valuesDataType: 'float64',
    });

    expect(result.keys_data_type).toBe('uint64');
    expect(result.values_data_type).toBe('float64');
  });
});
