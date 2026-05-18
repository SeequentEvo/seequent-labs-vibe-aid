import type { BoundingBox } from './bounding-box';
import type { CrsWire } from './crs';

export interface BaseSpatialInput {
  readonly name: string;
  readonly description: string;
  readonly boundingBox: BoundingBox;
  readonly crs: CrsWire;
  readonly tags?: Readonly<Record<string, string>>;
}

export interface BaseSpatialProperties {
  readonly uuid: null;
  readonly name: string;
  readonly description: string;
  readonly bounding_box: BoundingBox;
  readonly coordinate_reference_system: CrsWire;
  readonly tags: Readonly<Record<string, string>>;
}

/**
 * Build the base-spatial-data-properties fragment.
 *
 * Sets `uuid: null` for new objects. Tags default to `{}`.
 * Does NOT include `schema` — the object-type-specific builder adds that.
 */
export function baseSpatialProperties(input: BaseSpatialInput): BaseSpatialProperties {
  return {
    uuid: null,
    name: input.name,
    description: input.description,
    bounding_box: input.boundingBox,
    coordinate_reference_system: input.crs,
    tags: input.tags ?? {},
  };
}
