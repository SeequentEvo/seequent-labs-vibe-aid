import { describe, expect, it } from 'vitest';

import { fromToComponent } from './from-to';

const blobRef = { sha256: 'fromto-sha256' } as const;

describe('fromToComponent', () => {
  it('builds from-to with float-array-2 start_and_end', () => {
    const result = fromToComponent({ length: 50, blobRef });

    expect(result.intervals.start_and_end).toEqual({
      data: 'fromto-sha256',
      length: 50,
      data_type: 'float64',
      width: 2,
    });
  });

  it('omits unit when not provided', () => {
    const result = fromToComponent({ length: 10, blobRef });

    expect('unit' in result).toBe(false);
  });

  it('includes unit when provided', () => {
    const result = fromToComponent({ length: 10, blobRef, unit: 'metre' });

    expect(result.unit).toBe('metre');
  });
});
