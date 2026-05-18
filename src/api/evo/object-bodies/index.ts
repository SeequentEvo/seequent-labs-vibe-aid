export { baseSpatialProperties } from './base-spatial';
export type { BaseSpatialInput, BaseSpatialProperties } from './base-spatial';

export { boundingBoxFromXYZ } from './bounding-box';
export type { BoundingBox } from './bounding-box';

export { normaliseCrs } from './crs';
export type { CrsWire, CrsInput } from './crs';

export {
  floatArrayElement,
  integerArrayElement,
  stringArrayElement,
  lookupTableElement,
  boolArrayElement,
  holeChunksElement,
} from './elements';
export type {
  ArrayTableInfo,
  LookupTableInfo,
  ElementBlobRef,
  ArrayElementOpts,
  HoleChunksInfo,
} from './elements';

export { categoryDataComponent } from './category-data';
export type { CategoryDataInput, CategoryDataComponent } from './category-data';

export { fromToComponent } from './from-to';
export type { FromToInput, FromToComponent } from './from-to';

export { locationsComponent } from './locations';
export type { LocationsComponent } from './locations';

export { attributeEntry } from './attributes';
export type { AttributeKind, AttributeInput, AttributeEntry } from './attributes';
