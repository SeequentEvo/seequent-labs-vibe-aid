export const DOWNHOLE_COLLECTION_SCHEMA_FAMILY = '/objects/downhole-collection/';

export { buildHoleDictionary, groupAndSortRows } from './holes';
export type { HoleDictionary, HoleChunk } from './holes';

export { prepareCollectionForUpload } from './prepare';
export type {
  CollarsInput,
  PathInput,
  IntervalChildInput,
  DistanceChildInput,
  PlanarChildInput,
  LineationChildInput,
  DataChildInput,
  ChildCollectionInput,
  ChildCollectionType,
  CollectionInput,
  PreparedChildCollection,
  CollectionPrepareResult,
} from './prepare';

export type {
  PreparedBlob,
  PreparedAttribute,
} from '@/api/evo/object-prepare';

export { buildCollectionBody } from './body';
export type { BuildCollectionBodyInput } from './body';
