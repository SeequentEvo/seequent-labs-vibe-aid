import { describe, expect, it } from 'vitest';

import type { AttributeEntry } from './attributes';
import type { ArrayTableInfo } from './elements';
import { locationsComponent } from './locations';

const coordinates: ArrayTableInfo = {
  data: 'abc123',
  length: 100,
  data_type: 'float64',
  width: 3,
};

const attr = (name: string): AttributeEntry =>
  ({
    name,
    key: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    attribute_type: 'scalar',
    values: { data: 'sha-vals', length: 100, data_type: 'float64' },
    nan_description: { values: [] },
  }) as unknown as AttributeEntry;

describe('locationsComponent', () => {
  it('returns coordinates and attributes as-is', () => {
    const attributes = [attr('grade')];
    const result = locationsComponent(coordinates, attributes);

    expect(result.coordinates).toBe(coordinates);
    expect(result.attributes).toBe(attributes);
  });

  it('accepts an empty attributes array', () => {
    const result = locationsComponent(coordinates, []);

    expect(result).toEqual({ coordinates, attributes: [] });
  });

  it('preserves multiple attributes in order', () => {
    const attributes = [attr('grade'), attr('density'), attr('recovery')];
    const result = locationsComponent(coordinates, attributes);

    expect(result.attributes).toHaveLength(3);
    expect(result.attributes[0]?.name).toBe('grade');
    expect(result.attributes[1]?.name).toBe('density');
    expect(result.attributes[2]?.name).toBe('recovery');
  });
});
