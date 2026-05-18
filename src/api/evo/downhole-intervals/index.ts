export const DOWNHOLE_INTERVALS_SCHEMA_FAMILY = '/objects/downhole-intervals/';

export { prepareIntervalsForUpload } from './prepare';
export type { IntervalsInput, IntervalsPrepareResult } from './prepare';
export type {
  PreparedBlob,
  PreparedAttribute,
} from '@/api/evo/object-prepare';

export { buildIntervalsBody } from './body';
export type { BuildIntervalsBodyInput } from './body';
