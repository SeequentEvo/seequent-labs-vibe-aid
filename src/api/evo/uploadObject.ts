/**
 * Generic object upload orchestrator.
 *
 * Pipeline:
 * 1. Stage all blobs in cache (encode + SHA-256 + cache write, NO network)
 * 2. Build body using buildBody(tagToRef)
 * 3. Extract blob refs from body — cross-check against staged set
 * 4. Request upload URLs (batch ≤32)
 * 5. Upload only exists:false blobs
 * 6. POST object body (gzip-compressed via evoFetch)
 */

import type { Table } from "@/api/evo/blob/parquetCodec";
import type {
  BlobRef,
  BlobStore,
  CacheScope,
  ProgressEvent,
} from "@/api/evo/blob";
import { asBlobRef, writeParquetToCache, uploadFromStore } from "@/api/evo/blob";
import type { EvoWorkspaceRef } from "@/api/evo/refs/workspace";
import type { GeoscienceObjectEnvelope } from "@/types/object";
import {
  createObject,
  requestObjectDataUploadUrls,
  updateObject,
  DATA_UPLOAD_NAMES_MAX,
} from "./objects";
import { EvoObjectRef } from "./refs/object";
import { extractBlobRefs } from "./extract-blob-refs";

/** A tagged parquet table to be staged as a blob. */
export interface TaggedTable {
  /** Logical tag the body builder will use to look up the blob reference. */
  readonly tag: string;
  /** Parquet-wasm Table ready for encoding. */
  readonly table: Table;
}

export type UploadPhase =
  | "staging-blobs"
  | "building-body"
  | "requesting-upload-urls"
  | "uploading-blobs"
  | "creating-object";

export interface UploadProgress {
  readonly phase: UploadPhase;
  /** For staging-blobs: blobs staged so far / total. */
  readonly blobsStaged?: number;
  readonly blobsTotal?: number;
  /** For uploading-blobs: bytes transferred / total bytes to upload. */
  readonly bytesTransferred?: number;
  readonly bytesTotal?: number;
}

export interface UploadObjectOptions {
  readonly ws: EvoWorkspaceRef;
  readonly objectPath: string;
  readonly blobs: readonly TaggedTable[];
  /**
   * Given a map of tag → BlobRef (SHA-256), return the complete object body
   * with `uuid: null` and all `data` fields referencing the correct hashes.
   */
  readonly buildBody: (tagToRef: ReadonlyMap<string, BlobRef>) => unknown;
  readonly store: BlobStore;
  readonly scope: CacheScope;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: UploadProgress) => void;
  /**
   * When set, upload as a new version of an existing object instead of
   * creating a new one at the path. The caller is responsible for confirming
   * with the user that an overwrite is intended (and that the existing
   * object's schema is compatible). The body's `uuid` is rewritten to match.
   */
  readonly existingObjectId?: string;
}

export async function uploadObjectWithData(
  opts: UploadObjectOptions,
  accessToken: string,
): Promise<GeoscienceObjectEnvelope> {
  const { ws, objectPath, blobs, buildBody, store, scope, signal, onProgress, existingObjectId } =
    opts;

  // --- Step 1: Stage all blobs ---
  onProgress?.({
    phase: "staging-blobs",
    blobsStaged: 0,
    blobsTotal: blobs.length,
  });

  const tagToRef = new Map<string, BlobRef>();
  const refToBytes = new Map<string, number>();

  for (let i = 0; i < blobs.length; i++) {
    const blob = blobs[i]!;
    const result = await writeParquetToCache({
      store,
      scope,
      table: blob.table,
    });
    tagToRef.set(blob.tag, result.ref);
    refToBytes.set(result.ref, result.bytes);
    onProgress?.({
      phase: "staging-blobs",
      blobsStaged: i + 1,
      blobsTotal: blobs.length,
    });
  }

  // --- Step 2: Build body ---
  onProgress?.({ phase: "building-body" });
  const body = buildBody(tagToRef);

  // --- Step 3: Extract and cross-check blob refs ---
  const bodyRefs = extractBlobRefs(body);
  const stagedHashes = new Set<string>(tagToRef.values());

  for (const hash of bodyRefs) {
    if (!stagedHashes.has(hash)) {
      throw new Error(
        `Body references blob ${hash} which was not staged. ` +
          `This is a bug in the body builder.`,
      );
    }
  }

  for (const hash of stagedHashes) {
    if (!bodyRefs.has(hash)) {
      throw new Error(
        `Staged blob ${hash} is not referenced by the body. ` +
          `This is a bug in the body builder.`,
      );
    }
  }

  // --- Step 4: Request upload URLs ---
  onProgress?.({ phase: "requesting-upload-urls" });

  const allHashes = [...bodyRefs];
  const uploadResults: Array<{
    name: string;
    exists: boolean;
    uploadUrl?: string;
  }> = [];

  for (let i = 0; i < allHashes.length; i += DATA_UPLOAD_NAMES_MAX) {
    const batch = allHashes.slice(i, i + DATA_UPLOAD_NAMES_MAX);
    const results = await requestObjectDataUploadUrls(ws, batch, accessToken);
    uploadResults.push(...results);
  }

  // --- Step 5: Upload missing blobs ---
  const missing = uploadResults.filter((r) => !r.exists);

  if (missing.length > 0) {
    const totalBytes = missing.reduce(
      (sum, r) => sum + (refToBytes.get(r.name) ?? 0),
      0,
    );
    let transferred = 0;

    onProgress?.({
      phase: "uploading-blobs",
      bytesTransferred: 0,
      bytesTotal: totalBytes,
    });

    for (const entry of missing) {
      if (!entry.uploadUrl) {
        throw new Error(
          `No upload URL for blob ${entry.name} (exists: false)`,
        );
      }
      const blobSize = refToBytes.get(entry.name) ?? 0;
      const baseTransferred = transferred;
      await uploadFromStore({
        store,
        scope,
        ref: asBlobRef(entry.name),
        uploadUrl: entry.uploadUrl,
        signal,
        onProgress: (e: ProgressEvent) => {
          onProgress?.({
            phase: "uploading-blobs",
            bytesTransferred: baseTransferred + e.transferred,
            bytesTotal: totalBytes,
          });
        },
      });
      transferred += blobSize;
    }
  }

  // --- Step 6: POST object ---
  // Caller decides between creating a new object at the path or replacing the
  // object at the path with a new version. The path validator surfaces the
  // existing object's UUID and schema compatibility before we get here.
  onProgress?.({ phase: "creating-object" });
  if (existingObjectId !== undefined) {
    setBodyUuid(body, existingObjectId);
    const ref = EvoObjectRef.fromWorkspace(ws, { objectId: existingObjectId });
    return updateObject(ref, body, accessToken);
  }
  return createObject(ws, { path: objectPath, object: body }, accessToken);
}

/** Mutate a built object body's `uuid` field. The body builder's contract is
 *  to set `uuid: null` for new objects; this swaps in the existing UUID when
 *  uploading a new version. */
function setBodyUuid(body: unknown, uuid: string): void {
  if (body === null || typeof body !== "object") {
    throw new Error("Cannot set uuid on non-object body");
  }
  (body as { uuid: string }).uuid = uuid;
}
