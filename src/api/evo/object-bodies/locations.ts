import type { AttributeEntry } from './attributes';
import type { ArrayTableInfo } from './elements';

export interface LocationsComponent {
  readonly coordinates: ArrayTableInfo;
  readonly attributes: readonly AttributeEntry[];
}

/**
 * Build the `locations` component of a pointset (or similar) object body.
 */
export function locationsComponent(
  coordinates: ArrayTableInfo,
  attributes: readonly AttributeEntry[],
): LocationsComponent {
  return { coordinates, attributes };
}
