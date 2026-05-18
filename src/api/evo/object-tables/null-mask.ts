/**
 * Zero-copy null masking — build a validity bitmap from sentinel values
 * and apply it to an Arrow Vector without copying the data buffer.
 */

import { BufferType, makeVector, type Data, type Vector } from "apache-arrow";

/**
 * Build a validity bitmap from the union of null sources:
 * 1. Existing Parquet nulls (from the vector's own validity bitmap)
 * 2. IEEE NaN values (for continuous types only)
 * 3. Schema sentinel values (from nan_description.values)
 *
 * Returns null if no bits were cleared (no nulls to add).
 */
export function buildNullMask(
  vector: Vector,
  sentinels: ReadonlySet<number>,
  isContinuous: boolean,
): Uint8Array | null {
  const len = vector.length;
  const byteLen = Math.ceil(len / 8);
  const bitmap = new Uint8Array(byteLen);
  bitmap.fill(0xff);

  let modified = false;

  for (let i = 0; i < len; i++) {
    const val = vector.get(i) as unknown;
    const isExistingNull = val === null || val === undefined;
    const isNaN = isContinuous && typeof val === "number" && Number.isNaN(val);
    const isSentinel = typeof val === "number" && sentinels.has(val);

    if (isExistingNull || isNaN || isSentinel) {
      bitmap[i >> 3]! &= ~(1 << (i & 7));
      modified = true;
    }
  }

  return modified ? bitmap : null;
}

/**
 * Apply a null mask to a vector, returning a new Vector that shares the
 * original chunk buffers but has a new validity bitmap on each chunk.
 *
 * The supplied `nullBitmap` is row-addressed across the whole vector
 * (bits 0..vector.length-1). Arrow vectors may be split into multiple
 * chunks, each with its own offset and existing validity bitmap, so we
 * re-emit one Data per chunk: each chunk's other buffers are preserved,
 * but buffers[VALIDITY] is replaced with a fresh chunk-relative bitmap
 * that AND-merges the source mask with the chunk's existing validity.
 */
export function applyNullMask(vector: Vector, nullBitmap: Uint8Array): Vector {
  const newChunks: Data[] = [];
  let sourceBitOffset = 0;

  for (const chunk of vector.data) {
    const chunkLen = chunk.length;
    const chunkOffset = chunk.offset;
    const bitmapBytes = Math.ceil((chunkOffset + chunkLen) / 8);
    const chunkBitmap = new Uint8Array(bitmapBytes);
    chunkBitmap.fill(0xff);

    const existing = chunk.nullBitmap;
    const hasExisting = existing && existing.byteLength > 0;
    let chunkNullCount = 0;

    for (let i = 0; i < chunkLen; i++) {
      const srcIdx = sourceBitOffset + i;
      const srcBit = (nullBitmap[srcIdx >> 3]! >> (srcIdx & 7)) & 1;
      const dstIdx = chunkOffset + i;
      const existingBit = hasExisting
        ? (existing[dstIdx >> 3]! >> (dstIdx & 7)) & 1
        : 1;
      if (!(srcBit && existingBit)) {
        chunkBitmap[dstIdx >> 3]! &= ~(1 << (dstIdx & 7));
        chunkNullCount++;
      }
    }

    const buffers: typeof chunk.buffers = {
      ...chunk.buffers,
      [BufferType.VALIDITY]: chunkBitmap,
    };

    newChunks.push(
      chunk.clone(chunk.type, chunkOffset, chunkLen, chunkNullCount, buffers),
    );
    sourceBitOffset += chunkLen;
  }

  return makeVector(newChunks);
}
