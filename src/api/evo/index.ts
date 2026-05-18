/**
 * Barrel for the Evo API helpers.
 *
 * Two import styles are supported and both are first-class:
 *
 *   // Flat import via the barrel — discoverable, good for one-off uses:
 *   import { fetchObject, listStages } from '@/api/evo';
 *
 *   // Namespace import per module — groups operations at the call site,
 *   // good when a file uses many helpers from one service:
 *   import * as objects from '@/api/evo/objects';
 *   import * as stages from '@/api/evo/stages';
 *   await objects.fetchObject(ref, token);
 *   await stages.listStages(ws, token);
 *
 * See plan: pure free-function API style, namespacing via import alias.
 */

// Refs (URI-derived reference values)
export * from "./refs";

// Errors
export {
  EvoApiError,
  EvoNetworkError,
  EvoSchemaError,
  evoStructuredErrorSchema,
} from "./errors";
export type { EvoStructuredError } from "./errors";

// Pagination
export type { Page } from "./pagination";

// Authenticated fetch wrapper
export { evoFetch, assertOk } from "./fetch";
export type {
  EvoMethod,
  EvoOk,
  EvoErr,
  EvoResult,
  EvoFetchOptions,
} from "./fetch";

// Discovery
export { fetchDiscovery, resolveInstances } from "./discovery";

// Workspaces
export { fetchWorkspaces, fetchWorkspaceSummaries, getWorkspaceThumbnailUrl } from "./workspaces";
export type { WorkspaceSummary } from "./workspaces";

// Geoscience objects
export {
  BATCH_VERSION_CHECK_MAX,
  DATA_UPLOAD_NAMES_MAX,
  listObjects,
  fetchObject,
  createObject,
  updateObject,
  deleteObject,
  restoreObject,
  batchCheckLatestObjectVersions,
  requestObjectDataUploadUrls,
  extractObjectDataDownloadUrls,
} from "./objects";
export type {
  ListObjectsFilters,
  LatestObjectVersionResult,
  DataUploadUrlResult,
  FetchObjectOptions,
  CreateObjectBody,
} from "./objects";

// Object stages
export { listStages, applyStage, unsetStage } from "./stages";

// Binary blob cache + transfers + parquet I/O
export * from "./blob";

// Upload orchestrator
export { uploadObjectWithData } from "./uploadObject";
export type { UploadObjectOptions, UploadProgress } from "./uploadObject";

// Extract blob refs (body walker)
export { extractBlobRefs } from "./extract-blob-refs";

// Object body helpers
export * from "./object-bodies";

// Pointset
export * from "./pointset";
