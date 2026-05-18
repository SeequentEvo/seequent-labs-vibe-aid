/**
 * Public surface of the binary blob layer.
 *
 * Domain code consumes this barrel; internal helpers (`opfsCapacity`,
 * `opfsLocks`, `opfsEmitter`, `transferHelpers`) are intentionally not
 * re-exported.
 */

// Types
export type {
  BlobRef,
  BlobKind,
  CacheScope,
  ProgressEvent,
  BlobStoreEvents,
  EvictionReason,
  PressureTrigger,
  Unsubscribe,
} from "./types";
export { asBlobRef, BlobStoreQuotaError, BlobTransferError } from "./types";

// Store interface + factories
export type { BlobStore, UsageReport } from "./store";
export { cacheKeyPath } from "./store";
export { OpfsBlobStore } from "./opfsBlobStore";
export type { OpfsBlobStoreOptions } from "./opfsBlobStore";
export { InMemoryBlobStore } from "./inMemoryBlobStore";
export type { InMemoryBlobStoreOptions } from "./inMemoryBlobStore";

// Transfers
export { downloadToStore } from "./download";
export type { DownloadOptions } from "./download";
export { uploadFromStore } from "./upload";
export type { UploadOptions } from "./upload";

// Parquet
export { encodeParquet, decodeParquet, sha256Hex } from "./parquetCodec";
export type { Table } from "./parquetCodec";
export {
  readParquetFromCache,
  writeParquetToCache,
} from "./parquetService";
export type {
  ReadParquetOptions,
  WriteParquetOptions,
  WriteParquetResult,
  DownloadFn,
} from "./parquetService";
