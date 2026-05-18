import {
  makeBuilder,
  Float64,
  Int64,
  Int32,
  Utf8,
  Bool,
  type Vector,
} from 'apache-arrow';

export interface CategoryEncodeResult {
  readonly codes: Vector<Int32>;
  readonly lookup: {
    readonly keys: Int32Array;
    readonly values: string[];
  };
}

export function float64Vector(values: readonly number[]): Vector<Float64> {
  const builder = makeBuilder({ type: new Float64() });
  for (const v of values) {
    builder.append(v);
  }
  return builder.finish().toVector();
}

export function nullableFloat64Vector(
  values: readonly (number | null)[],
): Vector<Float64> {
  const builder = makeBuilder({ type: new Float64() });
  for (const v of values) {
    if (v === null) {
      builder.append(null);
    } else {
      builder.append(v);
    }
  }
  return builder.finish().toVector();
}

export function nullableInt64Vector(
  values: readonly (number | null)[],
): Vector<Int64> {
  const builder = makeBuilder({ type: new Int64() });
  for (const v of values) {
    if (v === null) {
      builder.append(null);
    } else {
      builder.append(BigInt(v));
    }
  }
  return builder.finish().toVector();
}

export function nullableUtf8Vector(
  values: readonly (string | null)[],
): Vector<Utf8> {
  const builder = makeBuilder({ type: new Utf8() });
  for (const v of values) {
    if (v === null) {
      builder.append(null);
    } else {
      builder.append(v);
    }
  }
  return builder.finish().toVector();
}

export function nullableBoolVector(
  values: readonly (boolean | null)[],
): Vector<Bool> {
  const builder = makeBuilder({ type: new Bool() });
  for (const v of values) {
    if (v === null) {
      builder.append(null);
    } else {
      builder.append(v);
    }
  }
  return builder.finish().toVector();
}

export function encodeCategoryColumn(
  values: readonly (string | null)[],
): CategoryEncodeResult {
  const categoryMap = new Map<string, number>();
  const categoryValues: string[] = [];

  const codeBuilder = makeBuilder({ type: new Int32() });

  for (const v of values) {
    if (v === null) {
      codeBuilder.append(null);
    } else {
      let code = categoryMap.get(v);
      if (code === undefined) {
        code = categoryValues.length;
        categoryMap.set(v, code);
        categoryValues.push(v);
      }
      codeBuilder.append(code);
    }
  }

  const keys = new Int32Array(categoryValues.length);
  for (let i = 0; i < categoryValues.length; i++) {
    keys[i] = i;
  }

  return {
    codes: codeBuilder.finish().toVector(),
    lookup: { keys, values: categoryValues },
  };
}
