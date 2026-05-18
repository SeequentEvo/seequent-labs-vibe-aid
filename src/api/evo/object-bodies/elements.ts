export interface ArrayTableInfo {
  readonly data: string;
  readonly length: number;
  readonly data_type: string;
  readonly width?: number;
}

// width is required for float-array-md / integer-array-md element schemas
// (including their width===1 specialisations). It is absent only for string-array.

export interface LookupTableInfo {
  readonly data: string;
  readonly length: number;
  readonly keys_data_type: string;
  readonly values_data_type: string;
}

export interface ElementBlobRef {
  readonly sha256: string;
}

export interface ArrayElementOpts {
  readonly length: number;
  readonly blobRef: ElementBlobRef;
}

export function floatArrayElement(
  width: number,
  opts: ArrayElementOpts,
): ArrayTableInfo {
  return {
    data: opts.blobRef.sha256,
    length: opts.length,
    data_type: 'float64',
    width,
  };
}

export function integerArrayElement(
  width: number,
  opts: ArrayElementOpts & { readonly dataType: 'int32' | 'int64' },
): ArrayTableInfo {
  return {
    data: opts.blobRef.sha256,
    length: opts.length,
    data_type: opts.dataType,
    width,
  };
}

export function stringArrayElement(opts: ArrayElementOpts): ArrayTableInfo {
  return {
    data: opts.blobRef.sha256,
    length: opts.length,
    data_type: 'string',
  };
}

/** Bool-array element (e.g. plane_polarity). No width field. */
export function boolArrayElement(opts: ArrayElementOpts): ArrayTableInfo {
  return {
    data: opts.blobRef.sha256,
    length: opts.length,
    data_type: 'bool',
  };
}

/** Hole-chunks element — fixed composite data_type. */
export interface HoleChunksInfo {
  readonly data: string;
  readonly length: number;
  readonly width: 3;
  readonly data_type: 'int32/uint64/uint64';
}

export function holeChunksElement(opts: ArrayElementOpts): HoleChunksInfo {
  return {
    data: opts.blobRef.sha256,
    length: opts.length,
    width: 3,
    data_type: 'int32/uint64/uint64',
  };
}

export function lookupTableElement(opts: {
  readonly length: number;
  readonly blobRef: ElementBlobRef;
  readonly keysDataType?: string;
  readonly valuesDataType?: string;
}): LookupTableInfo {
  return {
    data: opts.blobRef.sha256,
    length: opts.length,
    keys_data_type: opts.keysDataType ?? 'int32',
    values_data_type: opts.valuesDataType ?? 'string',
  };
}
