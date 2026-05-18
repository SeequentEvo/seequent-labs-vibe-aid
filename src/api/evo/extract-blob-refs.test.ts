import { describe, expect, it } from 'vitest';

import { extractBlobRefs } from './extract-blob-refs';

describe('extractBlobRefs', () => {
  it('extracts all blob refs from a full pointset body', () => {
    const body = {
      schema: '/objects/pointset/1.3.0/pointset.schema.json',
      uuid: null,
      name: 'Test pointset',
      description: '',
      bounding_box: { min_x: 0, max_x: 1, min_y: 0, max_y: 1, min_z: 0, max_z: 1 },
      coordinate_reference_system: 'unspecified',
      locations: {
        coordinates: { width: 3, data_type: 'float64', length: 10, data: 'a'.repeat(64) },
        attributes: [
          {
            name: 'grade',
            key: 'k1',
            attribute_type: 'scalar',
            nan_description: { values: [] },
            values: { data_type: 'float64', length: 10, data: 'b'.repeat(64) },
          },
          {
            name: 'count',
            key: 'k2',
            attribute_type: 'integer',
            nan_description: { values: [] },
            values: { data_type: 'int64', length: 10, data: 'c'.repeat(64) },
          },
          {
            name: 'label',
            key: 'k3',
            attribute_type: 'string',
            values: { data_type: 'string', length: 10, data: 'd'.repeat(64) },
          },
          {
            name: 'rock',
            key: 'k4',
            attribute_type: 'category',
            nan_description: { values: [] },
            values: { data_type: 'int32', length: 10, data: 'e'.repeat(64) },
            table: {
              keys_data_type: 'int32',
              values_data_type: 'string',
              length: 3,
              data: 'f'.repeat(64),
            },
          },
        ],
      },
      tags: {},
    };

    const refs = extractBlobRefs(body);

    expect(refs.size).toBe(6);
    expect(refs).toContain('a'.repeat(64));
    expect(refs).toContain('b'.repeat(64));
    expect(refs).toContain('c'.repeat(64));
    expect(refs).toContain('d'.repeat(64));
    expect(refs).toContain('e'.repeat(64));
    expect(refs).toContain('f'.repeat(64));
  });

  it('returns empty Set for empty body', () => {
    expect(extractBlobRefs({}).size).toBe(0);
  });

  it('ignores stray "data" field without data_type or keys_data_type', () => {
    const body = { data: 'a'.repeat(64), name: 'foo' };

    expect(extractBlobRefs(body).size).toBe(0);
  });

  it('ignores non-hex data values', () => {
    const body = { data: 'not-a-hash', data_type: 'float64' };

    expect(extractBlobRefs(body).size).toBe(0);
  });

  it('ignores uppercase hex data values', () => {
    const body = { data: 'A'.repeat(64), data_type: 'float64' };

    expect(extractBlobRefs(body).size).toBe(0);
  });

  it('deduplicates identical hashes', () => {
    const hash = 'a'.repeat(64);
    const body = {
      elem1: { data: hash, data_type: 'float64', length: 5 },
      elem2: { data: hash, data_type: 'int32', length: 5 },
    };

    const refs = extractBlobRefs(body);

    expect(refs.size).toBe(1);
    expect(refs).toContain(hash);
  });

  it('finds hashes in deeply nested structures', () => {
    const body = {
      level1: {
        level2: {
          level3: {
            values: { data: 'a'.repeat(64), data_type: 'float64', length: 1 },
          },
        },
      },
    };

    const refs = extractBlobRefs(body);

    expect(refs.size).toBe(1);
    expect(refs).toContain('a'.repeat(64));
  });

  it('returns empty Set for null, primitives, and arrays without matches', () => {
    expect(extractBlobRefs(null).size).toBe(0);
    expect(extractBlobRefs(undefined).size).toBe(0);
    expect(extractBlobRefs(42).size).toBe(0);
    expect(extractBlobRefs('hello').size).toBe(0);
    expect(extractBlobRefs([1, 2, 3]).size).toBe(0);
  });

  it('extracts all blob refs from a downhole-intervals body', () => {
    const body = {
      schema: '/objects/downhole-intervals/1.0.0/downhole-intervals.schema.json',
      uuid: null,
      name: 'Test intervals',
      description: '',
      bounding_box: { min_x: 0, max_x: 1, min_y: 0, max_y: 1, min_z: 0, max_z: 1 },
      coordinate_reference_system: 'unspecified',
      start: {
        coordinates: { width: 3, data_type: 'float64', length: 20, data: 'a'.repeat(64) },
      },
      end: {
        coordinates: { width: 3, data_type: 'float64', length: 20, data: 'b'.repeat(64) },
      },
      mid_points: {
        coordinates: { width: 3, data_type: 'float64', length: 20, data: 'c'.repeat(64) },
      },
      from_to: {
        intervals: {
          start_and_end: { width: 2, data_type: 'float64', length: 20, data: 'd'.repeat(64) },
        },
      },
      hole_id: {
        values: { data_type: 'int32', length: 20, data: 'e'.repeat(64) },
        table: {
          keys_data_type: 'int32',
          values_data_type: 'string',
          length: 5,
          data: 'f'.repeat(64),
        },
      },
      attributes: [
        {
          name: 'grade',
          key: 'k1',
          attribute_type: 'scalar',
          values: { data_type: 'float64', length: 20, data: '1'.repeat(64) },
        },
        {
          name: 'rock',
          key: 'k2',
          attribute_type: 'category',
          values: { data_type: 'int32', length: 20, data: '2'.repeat(64) },
          table: {
            keys_data_type: 'int32',
            values_data_type: 'string',
            length: 3,
            data: '3'.repeat(64),
          },
        },
      ],
      tags: {},
    };

    const refs = extractBlobRefs(body);

    // a–f (6 structural) + 1,2,3 (3 attribute) = 9
    expect(refs.size).toBe(9);
    for (const ch of ['a', 'b', 'c', 'd', 'e', 'f', '1', '2', '3']) {
      expect(refs).toContain(ch.repeat(64));
    }
  });

  it('extracts all blob refs from a downhole-collection body', () => {
    const h = (ch: string) => ch.repeat(64);

    const body = {
      schema: '/objects/downhole-collection/1.0.0/downhole-collection.schema.json',
      uuid: null,
      name: 'Test collection',
      description: '',
      bounding_box: { min_x: 0, max_x: 1, min_y: 0, max_y: 1, min_z: 0, max_z: 1 },
      coordinate_reference_system: 'unspecified',
      location: {
        coordinates: { width: 3, data_type: 'float64', length: 50, data: h('a') },
        distances: { data_type: 'float64', length: 50, data: h('b') },
        holes: { data_type: 'int32/uint64/uint64', length: 5, data: h('c') },
        hole_id: {
          values: { data_type: 'int32', length: 50, data: h('d') },
          table: {
            keys_data_type: 'int32',
            values_data_type: 'string',
            length: 5,
            data: h('e'),
          },
        },
        path: { width: 3, data_type: 'float64', length: 100, data: h('f') },
      },
      collections: [
        {
          name: 'intervals-child',
          collection_type: 'interval',
          from_to: {
            intervals: {
              start_and_end: {
                width: 2,
                data_type: 'float64',
                length: 10,
                data: h('1'),
              },
            },
            attributes: [
              {
                name: 'assay',
                key: 'k1',
                attribute_type: 'scalar',
                values: { data_type: 'float64', length: 10, data: h('2') },
              },
            ],
          },
          holes: { data_type: 'int32/uint64/uint64', length: 5, data: h('3') },
        },
        {
          name: 'distance-child',
          collection_type: 'distance',
          distance: {
            values: { data_type: 'float64', length: 8, data: h('4') },
            attributes: [
              {
                name: 'density',
                key: 'k2',
                attribute_type: 'category',
                values: { data_type: 'int32', length: 8, data: h('5') },
                table: {
                  keys_data_type: 'int32',
                  values_data_type: 'string',
                  length: 2,
                  data: h('6'),
                },
              },
            ],
          },
          holes: { data_type: 'int32/uint64/uint64', length: 3, data: h('7') },
        },
        {
          name: 'planar-child',
          collection_type: 'planar',
          distance: {
            values: { data_type: 'float64', length: 6, data: h('8') },
          },
          relative_plane_angles: {
            width: 2,
            data_type: 'float64',
            length: 6,
            data: h('9'),
          },
          plane_polarity: { data_type: 'bool', length: 6, data: '0'.repeat(64) },
          holes: { data_type: 'int32/uint64/uint64', length: 2, data: 'ab'.repeat(32) },
        },
        {
          name: 'lineation-child',
          collection_type: 'lineation',
          distance: {
            values: { data_type: 'float64', length: 4, data: 'cd'.repeat(32) },
          },
          relative_lineation_angles: {
            width: 2,
            data_type: 'float64',
            length: 4,
            data: 'ef'.repeat(32),
          },
          holes: { data_type: 'int32/uint64/uint64', length: 1, data: '01'.repeat(32) },
        },
      ],
      tags: {},
    };

    const refs = extractBlobRefs(body);

    // location: a,b,c,d,e,f = 6
    // interval child: 1,2,3 = 3
    // distance child: 4,5,6,7 = 4
    // planar child: 8,9, 0-repeat, ab-repeat = 4
    // lineation child: cd-repeat, ef-repeat, 01-repeat = 3
    // total = 20
    expect(refs.size).toBe(20);
    for (const ch of [
      'a', 'b', 'c', 'd', 'e', 'f',
      '1', '2', '3', '4', '5', '6', '7', '8', '9',
    ]) {
      expect(refs).toContain(h(ch));
    }
    expect(refs).toContain('0'.repeat(64));
    expect(refs).toContain('ab'.repeat(32));
    expect(refs).toContain('cd'.repeat(32));
    expect(refs).toContain('ef'.repeat(32));
    expect(refs).toContain('01'.repeat(32));
  });
});
