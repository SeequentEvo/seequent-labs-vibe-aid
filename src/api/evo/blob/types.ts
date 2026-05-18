/**
 * Shared types for the binary blob cache + transfer layer.
 *
 * Conventions:
 * - `BlobRef` is **opaque**: it may be a SHA-256 hex digest *or* a UUID.
 *   The cache never assumes the bytes hash back to the ref (per the
 *   prior-art doc: downloaded SHA-256s are not trusted; only client-side
 *   uploads compute their own correct SHA-256 for de-duplication).
 * - Cache keys are scoped by `OrgId / WorkspaceId / BlobKind / BlobRef`.
 *   `kind` separates references that are unique only within an API
 *   (a File API id is not a Geoscience Object data-blob ref).
 */

import type { OrgId, WorkspaceId } from "@/types/ids";

declare const blobBrand: unique symbol;

/** Opaque blob reference — SHA-256 digest or UUID. */
export type BlobRef = string & { readonly [blobBrand]: "BlobRef" };

/** Treat any non-empty string as a `BlobRef`. */
export const asBlobRef = (v: string): BlobRef => {
  if (v.length === 0) throw new Error("BlobRef must be non-empty");
  return v as BlobRef;
};

/** Which Evo API the blob belongs to — controls cache namespacing. */
export type BlobKind = "geoscience-object" | "file";

/** Fully-qualified cache scope. */
export interface CacheScope {
  readonly orgId: OrgId;
  readonly workspaceId: WorkspaceId;
  readonly kind: BlobKind;
}

/** Progress callback payload for chunked transfers. */
export interface ProgressEvent {
  readonly transferred: number;
  readonly total: number;
}

/** Reason an entry was evicted. */
export type EvictionReason = "lru-budget" | "lru-quota" | "manual";

/** Trigger that fired a budget-pressure event. */
export type PressureTrigger = "budget" | "browser-quota";

/** Typed event payloads emitted by `BlobStore`. */
export interface BlobStoreEvents {
  "budget-pressure": {
    readonly bytesUsed: number;
    readonly bytesBudget: number;
    readonly quotaUsage?: number;
    readonly quotaCapacity?: number;
    readonly trigger: PressureTrigger;
  };
  evicted: {
    readonly scope: CacheScope;
    readonly ref: BlobRef;
    readonly sizeBytes: number;
    readonly reason: EvictionReason;
  };
  "quota-error": {
    readonly ref: BlobRef;
    readonly sizeBytes: number;
  };
}

/** Listener disposer returned by `on()`. */
export type Unsubscribe = () => void;

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

/** Thrown when the cache cannot make room for a `put` after eviction. */
export class BlobStoreQuotaError extends Error {
  override readonly name = "BlobStoreQuotaError";
  readonly ref: BlobRef;
  readonly sizeBytes: number;
  readonly bytesUsed: number;
  readonly bytesBudget: number;
  constructor(args: {
    ref: BlobRef;
    sizeBytes: number;
    bytesUsed: number;
    bytesBudget: number;
    message?: string;
  }) {
    super(
      args.message ??
        `Cannot cache blob (${String(args.sizeBytes)} bytes): no room (used ${String(args.bytesUsed)} of ${String(args.bytesBudget)} bytes)`,
    );
    this.ref = args.ref;
    this.sizeBytes = args.sizeBytes;
    this.bytesUsed = args.bytesUsed;
    this.bytesBudget = args.bytesBudget;
  }
}

/** Thrown when a chunked transfer exhausts retries on a single chunk. */
export class BlobTransferError extends Error {
  override readonly name = "BlobTransferError";
  readonly ref: BlobRef;
  readonly chunkIndex: number | null;
  override readonly cause: unknown;
  constructor(args: {
    ref: BlobRef;
    chunkIndex: number | null;
    message: string;
    cause?: unknown;
  }) {
    super(args.message);
    this.ref = args.ref;
    this.chunkIndex = args.chunkIndex;
    this.cause = args.cause;
  }
}
