import type { ArrayTableInfo, ElementBlobRef } from './elements';
import { floatArrayElement } from './elements';

export interface FromToInput {
  readonly length: number;
  readonly blobRef: ElementBlobRef;
  readonly unit?: string;
}

export interface FromToComponent {
  readonly intervals: {
    readonly start_and_end: ArrayTableInfo;
  };
  readonly unit?: string;
}

/**
 * Build a from-to component.
 * intervals.start_and_end is a float-array-2 with columns "from", "to".
 */
export function fromToComponent(input: FromToInput): FromToComponent {
  const result: FromToComponent = {
    intervals: {
      start_and_end: floatArrayElement(2, {
        length: input.length,
        blobRef: input.blobRef,
      }),
    },
  };
  if (input.unit !== undefined) {
    return { ...result, unit: input.unit };
  }
  return result;
}
