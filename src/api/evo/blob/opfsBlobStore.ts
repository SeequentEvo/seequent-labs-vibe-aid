/**
 * `OpfsBlobStore` — durable, OPFS-backed implementation of `BlobStore`.
 *
 * # Layout
 *
 *   /evo-cache/v1/<orgId>/<workspaceId>/<kind>/<ref>   — blob bytes
 *   /evo-cache/v1/index.json                           — LRU metadata
 *   /evo-cache/v1/index.json.tmp                       — atomic-write staging
 *
 * # Index persistence
 *
 * The full `IndexFile` is loaded once at `create()` and held in memory. Every
 * mutation is followed by a `schedulePersist()` call that debounces the
 * atomic write to ~50ms after the last change. `clearAll` and `evictUntil`
 * flush synchronously.
 *
 * Atomic write strategy (no reliance on `FileSystemFileHandle.move()`, which
 * is not yet available across all browsers):
 *
 *   1. Write JSON bytes to `index.json.tmp`.
 *   2. Overwrite `index.json` with the same bytes.
 *   3. Remove `index.json.tmp`.
 *
 * If a crash occurs between (1) and (2) the existing `index.json` is intact.
 * If `index.json` is corrupt on load, we fall back to `index.json.tmp`.
 *
 * # Capacity / eviction
 *
 * `put`/`openWrite` run a pre-write capacity sweep:
 *   1. If the new entry would push us over `budgetBytes`, evict oldest
 *      entries (LRU) until under budget — fires `evicted` with reason
 *      `'lru-budget'` and a throttled `budget-pressure` (trigger
 *      `'budget'`).
 *   2. Probe `navigator.storage.estimate()`. If usage/quota crosses 0.9,
 *      evict aggressively to bring it back under 0.7 — fires `evicted`
 *      with reason `'lru-quota'` and `budget-pressure` with trigger
 *      `'browser-quota'`. The probe is wrapped in try/catch (Safari
 *      historically threw on this API).
 *   3. If after all sweeps the new blob alone still exceeds the budget,
 *      throw `BlobStoreQuotaError` and emit `quota-error`.
 *   4. If the underlying OPFS `createWritable`/`write` throws a
 *      `QuotaExceededError`, also emit `quota-error` and re-throw
 *      wrapped as `BlobStoreQuotaError`.
 *
 * `budget-pressure` is throttled globally to ≤1/s across both triggers.
 * Entries currently being written by an open `openWrite` stream are
 * "pinned" and excluded from eviction until the stream is closed/aborted.
 *
 * # Locking (multi-tab safe)
 *
 * Two locks, both surfaced via `opfsLocks.ts`:
 *
 *   - `evo-blob-cache:index` — held around every read-modify-write of the
 *     in-memory entries map and `index.json` on disk. On entry the lock
 *     holder stats `index.json` and reloads from disk when the on-disk
 *     mtime is newer than `_lastIndexMtimeMs` (closes the read-then-write
 *     race even when two tabs serialise via the lock).
 *   - `evo-blob-cache:write:<scope/kind/ref>` — held for the lifetime of
 *     a single-blob write so two tabs racing the same blob serialise.
 *     `put` re-checks `has` after acquiring and short-circuits if the peer
 *     tab finished first; `openWrite` holds the lock until the returned
 *     stream's `close`/`abort` settle hook fires.
 *
 * Both locks use `navigator.locks.request(name, { mode: 'exclusive' }, ...)`.
 * When `navigator.locks` is unavailable (very old environments) the
 * adapter falls back to a per-store promise chain — single-tab assumption
 * only — and `create()` logs once.
 *
 * Persistence runs inside `withIndexLock`: `flushPersist` (called from the
 * debounce timer) re-acquires the lock; in-lock callers reach
 * `_persistNowLocked` directly to avoid re-entrance.
 */

import type { OrgId, WorkspaceId } from "@/types/ids";
import type { BlobStore, UsageReport } from "./store";
import { cacheKeyPath } from "./store";
import {
  BlobStoreQuotaError,
  type BlobKind,
  type BlobRef,
  type BlobStoreEvents,
  type CacheScope,
  type EvictionReason,
  type PressureTrigger,
  type Unsubscribe,
} from "./types";
import { TypedEmitter } from "./opfsEmitter";
import {
  PressureThrottle,
  byteLengthOf,
  computeBrowserQuotaTarget,
  isQuotaError,
  probeBrowserQuota,
  sumSizes,
  wrapWritable,
} from "./opfsCapacity";
import { createLocksAdapter, type LocksAdapter } from "./opfsLocks";

const ROOT_DIR_NAME = "evo-cache";
const VERSION_DIR = "v1";
const INDEX_FILE = "index.json";
const INDEX_TMP_FILE = "index.json.tmp";
const DEFAULT_BUDGET_BYTES = 512 * 1024 * 1024;
const PERSIST_DEBOUNCE_MS = 50;

interface IndexEntry {
  orgId: string;
  workspaceId: string;
  kind: BlobKind;
  ref: string;
  sizeBytes: number;
  lastAccessMs: number;
}

interface IndexFile {
  version: 1;
  entries: IndexEntry[];
}

const entryKey = (
  orgId: string,
  workspaceId: string,
  kind: BlobKind,
  ref: string,
): string => `${orgId}/${workspaceId}/${kind}/${ref}`;

const scopeKey = (scope: CacheScope, ref: BlobRef): string =>
  entryKey(scope.orgId, scope.workspaceId, scope.kind, ref);

export interface OpfsBlobStoreOptions {
  rootDir?: FileSystemDirectoryHandle;
  budgetBytes?: number;
  /** Test seam — defaults to `createLocksAdapter()`. */
  locks?: LocksAdapter;
}

export class OpfsBlobStore implements BlobStore {
  private readonly emitter = new TypedEmitter();
  private readonly entries = new Map<string, IndexEntry>();
  private readonly pinned = new Set<string>();
  private readonly pressureThrottle = new PressureThrottle();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persistInFlight: Promise<void> | null = null;
  private dirty = false;
  private lastIndexMtimeMs = 0;
  private readonly locks: LocksAdapter;

  readonly budgetBytes: number;
  private readonly cacheRoot: FileSystemDirectoryHandle;

  private constructor(
    cacheRoot: FileSystemDirectoryHandle,
    budgetBytes: number,
    locks: LocksAdapter,
  ) {
    this.cacheRoot = cacheRoot;
    this.budgetBytes = budgetBytes;
    this.locks = locks;
  }

  static async create(
    options: OpfsBlobStoreOptions = {},
  ): Promise<OpfsBlobStore> {
    const root =
      options.rootDir ?? (await navigator.storage.getDirectory());
    const evoDir = await root.getDirectoryHandle(ROOT_DIR_NAME, {
      create: true,
    });
    const cacheRoot = await evoDir.getDirectoryHandle(VERSION_DIR, {
      create: true,
    });
    const locks = options.locks ?? createLocksAdapter();
    const store = new OpfsBlobStore(
      cacheRoot,
      options.budgetBytes ?? DEFAULT_BUDGET_BYTES,
      locks,
    );
    await store.loadIndex();
    return store;
  }

  on<E extends keyof BlobStoreEvents>(
    event: E,
    listener: (data: BlobStoreEvents[E]) => void,
  ): Unsubscribe {
    return this.emitter.on(event, listener);
  }

  /* ----------------------------------------------------------------- */
  /* Locking — multi-tab safe via opfsLocks adapter.                   */
  /* ----------------------------------------------------------------- */

  /**
   * Acquire the cross-tab index lock, then run `fn` after refreshing the
   * in-memory index from disk if another tab has written since our last
   * persist (mtime check). Critical sections must stay tight: load →
   * mutate → persist → release.
   */
  private withIndexLock<T>(fn: () => Promise<T>): Promise<T> {
    return this.locks.withIndex(async () => {
      await this.maybeReloadIndex();
      return fn();
    });
  }

  /**
   * Stat `index.json`'s mtime. If it has advanced beyond what we last
   * wrote AND we have no pending in-memory mutations, reload from disk to
   * pick up another tab's write.
   *
   * If `dirty` is true we hold pending changes that haven't been persisted
   * yet — reloading would discard them. In that (rare) case we keep our
   * in-memory state and let last-write-wins resolve the conflict.
   */
  private async maybeReloadIndex(): Promise<void> {
    let handle: FileSystemFileHandle;
    try {
      handle = await this.cacheRoot.getFileHandle(INDEX_FILE);
    } catch {
      return;
    }
    let mtime: number;
    try {
      const file = await handle.getFile();
      const lm = file.lastModified;
      if (typeof lm !== "number" || !Number.isFinite(lm)) return;
      mtime = lm;
    } catch {
      return;
    }
    if (mtime <= this.lastIndexMtimeMs) return;
    if (this.dirty) {
      console.warn(
        "[OpfsBlobStore] concurrent index write detected with pending local mutations; keeping local state (last-write-wins).",
      );
      this.lastIndexMtimeMs = mtime;
      return;
    }
    await this.loadIndex();
    this.lastIndexMtimeMs = mtime;
  }

  /* ----------------------------------------------------------------- */
  /* Index load / persist                                              */
  /* ----------------------------------------------------------------- */

  private async loadIndex(): Promise<void> {
    const parsed =
      (await this.tryReadIndex(INDEX_FILE)) ??
      (await this.tryReadIndex(INDEX_TMP_FILE));
    this.entries.clear();
    if (!parsed) return;
    for (const entry of parsed.entries) {
      this.entries.set(
        entryKey(entry.orgId, entry.workspaceId, entry.kind, entry.ref),
        { ...entry },
      );
    }
  }

  private async tryReadIndex(name: string): Promise<IndexFile | null> {
    let handle: FileSystemFileHandle;
    try {
      handle = await this.cacheRoot.getFileHandle(name);
    } catch {
      return null;
    }
    try {
      const file = await handle.getFile();
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        (parsed as Record<string, unknown>).version === 1 &&
        Array.isArray((parsed as Record<string, unknown>).entries)
      ) {
        return parsed as IndexFile;
      }
      return null;
    } catch {
      return null;
    }
  }

  private schedulePersist(): void {
    this.dirty = true;
    if (this.persistTimer !== null) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.flushPersist();
    }, PERSIST_DEBOUNCE_MS);
  }

  /**
   * Timer-fired flush — takes the index lock and persists current state.
   * In-lock callers must use `flushPersistLocked` instead to avoid
   * re-acquiring the lock from inside the critical section.
   */
  private async flushPersist(): Promise<void> {
    await this.locks.withIndex(() => this.flushPersistLocked());
  }

  private async flushPersistLocked(): Promise<void> {
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.persistInFlight) {
      await this.persistInFlight;
      if (!this.dirty) return;
    }
    if (!this.dirty) return;
    this.dirty = false;
    const snapshot: IndexFile = {
      version: 1,
      entries: Array.from(this.entries.values()).map((e) => ({ ...e })),
    };
    const promise = this.persistAtomically(snapshot).catch((err) => {
      this.dirty = true;
      console.error("[OpfsBlobStore] index persist failed", err);
    });
    this.persistInFlight = promise.finally(() => {
      this.persistInFlight = null;
    });
    await this.persistInFlight;
  }

  private async persistAtomically(snapshot: IndexFile): Promise<void> {
    const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
    const tmp = await this.cacheRoot.getFileHandle(INDEX_TMP_FILE, {
      create: true,
    });
    const tmpStream = await tmp.createWritable();
    await tmpStream.write(bytes);
    await tmpStream.close();

    const main = await this.cacheRoot.getFileHandle(INDEX_FILE, {
      create: true,
    });
    const mainStream = await main.createWritable();
    await mainStream.write(bytes);
    await mainStream.close();

    try {
      await this.cacheRoot.removeEntry(INDEX_TMP_FILE);
    } catch {
      // best-effort cleanup
    }

    try {
      const file = await main.getFile();
      const lm = file.lastModified;
      if (typeof lm === "number" && Number.isFinite(lm)) {
        this.lastIndexMtimeMs = lm;
      }
    } catch {
      // mtime is best-effort; on failure leave cached value alone
    }
  }

  /* ----------------------------------------------------------------- */
  /* OPFS path navigation                                              */
  /* ----------------------------------------------------------------- */

  private async scopeDir(
    scope: CacheScope,
    create: boolean,
  ): Promise<FileSystemDirectoryHandle | null> {
    return this.dirByParts(
      [scope.orgId, scope.workspaceId, scope.kind],
      create,
    );
  }

  private async dirByParts(
    parts: string[],
    create: boolean,
  ): Promise<FileSystemDirectoryHandle | null> {
    let cur: FileSystemDirectoryHandle = this.cacheRoot;
    for (const part of parts) {
      try {
        cur = await cur.getDirectoryHandle(part, { create });
      } catch {
        return null;
      }
    }
    return cur;
  }

  private async fileHandle(
    scope: CacheScope,
    ref: BlobRef,
    create: boolean,
  ): Promise<FileSystemFileHandle | null> {
    const dir = await this.scopeDir(scope, create);
    if (!dir) return null;
    try {
      return await dir.getFileHandle(ref, { create });
    } catch {
      return null;
    }
  }

  /* ----------------------------------------------------------------- */
  /* BlobStore — reads                                                 */
  /* ----------------------------------------------------------------- */

  async has(scope: CacheScope, ref: BlobRef): Promise<boolean> {
    return this.entries.has(scopeKey(scope, ref));
  }

  async size(scope: CacheScope, ref: BlobRef): Promise<number | undefined> {
    return this.entries.get(scopeKey(scope, ref))?.sizeBytes;
  }

  async openRead(scope: CacheScope, ref: BlobRef): Promise<Blob> {
    const key = scopeKey(scope, ref);
    const entry = this.entries.get(key);
    if (!entry) {
      throw new Error(`Blob not in cache: ${key}`);
    }
    const handle = await this.fileHandle(scope, ref, false);
    if (!handle) {
      this.entries.delete(key);
      this.schedulePersist();
      throw new Error(`Blob missing on disk: ${key}`);
    }
    const file = await handle.getFile();
    entry.lastAccessMs = Date.now();
    this.schedulePersist();
    return file;
  }

  async getUsage(scope?: Partial<CacheScope>): Promise<UsageReport> {
    let bytes = 0;
    let entries = 0;
    for (const e of this.entries.values()) {
      if (scope?.orgId && e.orgId !== scope.orgId) continue;
      if (scope?.workspaceId && e.workspaceId !== scope.workspaceId) continue;
      if (scope?.kind && e.kind !== scope.kind) continue;
      bytes += e.sizeBytes;
      entries += 1;
    }
    return { bytes, entries };
  }

  /* ----------------------------------------------------------------- */
  /* BlobStore — writes                                                */
  /* ----------------------------------------------------------------- */

  async put(
    scope: CacheScope,
    ref: BlobRef,
    bytes: BufferSource,
  ): Promise<void> {
    const writeKey = cacheKeyPath(scope, ref);
    return this.locks.withWrite(writeKey, async () => {
      // Re-check inside the per-ref write lock: if a peer tab finished the
      // same blob first, short-circuit without a redundant write.
      if (await this.has(scope, ref)) return;
      return this.withIndexLock(async () => {
        const sizeBytes = byteLengthOf(bytes);
        await this.prepareCapacityForWrite(scope, ref, sizeBytes);
        const handle = await this.fileHandle(scope, ref, true);
        if (!handle) throw new Error("Failed to open file handle for write");
        try {
          const stream = await handle.createWritable();
          await stream.write(bytes);
          await stream.close();
        } catch (err) {
          if (isQuotaError(err)) {
            const used = sumSizes(this.entries.values());
            this.emitter.emit("quota-error", { ref, sizeBytes });
            throw new BlobStoreQuotaError({
              ref,
              sizeBytes,
              bytesUsed: used,
              bytesBudget: this.budgetBytes,
            });
          }
          throw err;
        }
        this.upsertEntry(scope, ref, sizeBytes);
        this.schedulePersist();
      });
    });
  }

  async openWrite(
    scope: CacheScope,
    ref: BlobRef,
    totalBytes: number,
  ): Promise<FileSystemWritableFileStream> {
    const writeKey = cacheKeyPath(scope, ref);
    // Hold the per-ref write lock for the LIFETIME of the stream — release
    // when the caller closes/aborts the wrapped writable. Returning the
    // stream early via a deferred lets us keep the lock held while the
    // outer `openWrite` promise resolves with the stream.
    let resolveStream!: (s: FileSystemWritableFileStream) => void;
    let rejectStream!: (e: unknown) => void;
    const streamPromise = new Promise<FileSystemWritableFileStream>(
      (res, rej) => {
        resolveStream = res;
        rejectStream = rej;
      },
    );

    void this.locks.withWrite(writeKey, async () => {
      let resolveSettled!: () => void;
      const settled = new Promise<void>((r) => {
        resolveSettled = r;
      });
      let returnedStream = false;
      try {
        await this.withIndexLock(async () => {
          await this.prepareCapacityForWrite(scope, ref, totalBytes);
          const handle = await this.fileHandle(scope, ref, true);
          if (!handle) throw new Error("Failed to open file handle for write");
          let stream: FileSystemWritableFileStream;
          try {
            stream = await handle.createWritable();
          } catch (err) {
            if (isQuotaError(err)) {
              const used = sumSizes(this.entries.values());
              this.emitter.emit("quota-error", {
                ref,
                sizeBytes: totalBytes,
              });
              throw new BlobStoreQuotaError({
                ref,
                sizeBytes: totalBytes,
                bytesUsed: used,
                bytesBudget: this.budgetBytes,
              });
            }
            throw err;
          }
          this.upsertEntry(scope, ref, totalBytes);
          this.schedulePersist();
          const pinKey = scopeKey(scope, ref);
          this.pinned.add(pinKey);
          const wrapped = wrapWritable(stream, async (outcome) => {
            try {
              await this.withIndexLock(async () => {
                this.pinned.delete(pinKey);
                if (outcome === "close") {
                  await this.commitWrite(scope, ref, handle);
                }
              });
            } finally {
              resolveSettled();
            }
          });
          returnedStream = true;
          resolveStream(wrapped);
        });
      } catch (err) {
        rejectStream(err);
        if (!returnedStream) resolveSettled();
      }
      // Hold the per-ref lock until the stream is closed/aborted.
      await settled;
    });

    return streamPromise;
  }

  /**
   * Run pre-write capacity checks: budget LRU sweep, browser-quota probe,
   * and the hard "this blob alone exceeds budget" guard. Emits
   * `budget-pressure` (throttled) and `quota-error` as appropriate.
   *
   * Must be called while holding `withIndexLock`.
   */
  private async prepareCapacityForWrite(
    scope: CacheScope,
    ref: BlobRef,
    sizeBytes: number,
  ): Promise<void> {
    const key = scopeKey(scope, ref);
    const existing = this.entries.get(key);
    const existingSize = existing?.sizeBytes ?? 0;
    const currentBytes = sumSizes(this.entries.values());
    const projected = currentBytes - existingSize + sizeBytes;

    if (projected > this.budgetBytes) {
      // Drop the existing reservation so it can be replaced cleanly without
      // self-eviction throwing off the LRU candidate set.
      if (existing) {
        this.entries.delete(key);
      }
      const target = Math.max(0, this.budgetBytes - sizeBytes);
      await this._evictLruUntil(target, "lru-budget");
      this.maybeEmitPressure({ trigger: "budget" });
    }

    const snapshot = await probeBrowserQuota();
    if (
      snapshot.underPressure &&
      snapshot.usage !== undefined &&
      snapshot.quota !== undefined
    ) {
      const beforeBytes = sumSizes(this.entries.values());
      const target = computeBrowserQuotaTarget(
        beforeBytes,
        snapshot.usage,
        snapshot.quota,
      );
      if (target < beforeBytes) {
        await this._evictLruUntil(target, "lru-quota");
      }
      this.maybeEmitPressure({
        trigger: "browser-quota",
        quotaUsage: snapshot.usage,
        quotaCapacity: snapshot.quota,
      });
    }

    if (sizeBytes > this.budgetBytes) {
      const used = sumSizes(this.entries.values());
      this.emitter.emit("quota-error", { ref, sizeBytes });
      throw new BlobStoreQuotaError({
        ref,
        sizeBytes,
        bytesUsed: used,
        bytesBudget: this.budgetBytes,
      });
    }
  }

  private maybeEmitPressure(args: {
    trigger: PressureTrigger;
    quotaUsage?: number;
    quotaCapacity?: number;
  }): boolean {
    if (!this.pressureThrottle.allow()) return false;
    this.emitter.emit("budget-pressure", {
      bytesUsed: sumSizes(this.entries.values()),
      bytesBudget: this.budgetBytes,
      quotaUsage: args.quotaUsage,
      quotaCapacity: args.quotaCapacity,
      trigger: args.trigger,
    });
    return true;
  }

  private async commitWrite(
    scope: CacheScope,
    ref: BlobRef,
    handle: FileSystemFileHandle,
  ): Promise<void> {
    try {
      const file = await handle.getFile();
      const entry = this.entries.get(scopeKey(scope, ref));
      if (entry) {
        entry.sizeBytes = file.size;
        entry.lastAccessMs = Date.now();
        this.schedulePersist();
      }
    } catch (err) {
      console.error("[OpfsBlobStore] commitWrite failed", err);
    }
  }

  private upsertEntry(
    scope: CacheScope,
    ref: BlobRef,
    sizeBytes: number,
  ): void {
    this.entries.set(scopeKey(scope, ref), {
      orgId: scope.orgId,
      workspaceId: scope.workspaceId,
      kind: scope.kind,
      ref,
      sizeBytes,
      lastAccessMs: Date.now(),
    });
  }

  /* ----------------------------------------------------------------- */
  /* BlobStore — delete / clear / evict                                */
  /* ----------------------------------------------------------------- */

  async delete(scope: CacheScope, ref: BlobRef): Promise<void> {
    return this.withIndexLock(async () => {
      const key = scopeKey(scope, ref);
      const entry = this.entries.get(key);
      if (!entry) return;
      const dir = await this.scopeDir(scope, false);
      if (dir) {
        try {
          await dir.removeEntry(ref);
        } catch {
          // already gone
        }
      }
      this.entries.delete(key);
      this.schedulePersist();
      this.emitRemoved([entry], "manual");
    });
  }

  async clear(scope: CacheScope): Promise<void> {
    return this.withIndexLock(async () => {
      const removed: IndexEntry[] = [];
      for (const [key, e] of this.entries) {
        if (
          e.orgId === scope.orgId &&
          e.workspaceId === scope.workspaceId &&
          e.kind === scope.kind
        ) {
          removed.push(e);
          this.entries.delete(key);
        }
      }
      const dir = await this.scopeDir(scope, false);
      if (dir) {
        for (const e of removed) {
          try {
            await dir.removeEntry(e.ref);
          } catch {
            // ignore
          }
        }
      }
      if (removed.length > 0) {
        this.schedulePersist();
        await this.flushPersistLocked();
      }
      this.emitRemoved(removed, "manual");
    });
  }

  async clearInstance(orgId: OrgId): Promise<void> {
    return this.withIndexLock(async () => {
      const removed: IndexEntry[] = [];
      for (const [key, e] of this.entries) {
        if (e.orgId === orgId) {
          removed.push(e);
          this.entries.delete(key);
        }
      }
      try {
        await this.cacheRoot.removeEntry(orgId, { recursive: true });
      } catch {
        // ignore
      }
      if (removed.length > 0) {
        this.schedulePersist();
        await this.flushPersistLocked();
      }
      this.emitRemoved(removed, "manual");
    });
  }

  async clearAll(): Promise<void> {
    return this.withIndexLock(async () => {
      const removed = Array.from(this.entries.values());
      this.entries.clear();
      const orgs = new Set(removed.map((e) => e.orgId));
      for (const org of orgs) {
        try {
          await this.cacheRoot.removeEntry(org, { recursive: true });
        } catch {
          // ignore
        }
      }
      this.schedulePersist();
      await this.flushPersistLocked();
      this.emitRemoved(removed, "manual");
    });
  }

  async evictUntil(targetBytes: number): Promise<number> {
    return this.withIndexLock(() => this._evictLruUntil(targetBytes, "manual"));
  }

  /**
   * Shared LRU sweep used by manual `evictUntil`, the budget-pressure
   * pre-write hook, and the browser-quota response. Skips entries that are
   * currently pinned by an in-flight `openWrite` stream.
   *
   * Caller must hold `withIndexLock`.
   */
  private async _evictLruUntil(
    targetBytes: number,
    reason: EvictionReason,
  ): Promise<number> {
    const candidates = Array.from(this.entries.values())
      .filter(
        (e) =>
          !this.pinned.has(entryKey(e.orgId, e.workspaceId, e.kind, e.ref)),
      )
      .sort((a, b) => a.lastAccessMs - b.lastAccessMs);
    let total = sumSizes(this.entries.values());
    let freed = 0;
    const removed: IndexEntry[] = [];
    for (const entry of candidates) {
      if (total <= targetBytes) break;
      const dir = await this.dirByParts(
        [entry.orgId, entry.workspaceId, entry.kind],
        false,
      );
      if (dir) {
        try {
          await dir.removeEntry(entry.ref);
        } catch {
          // ignore — file may already be gone
        }
      }
      this.entries.delete(
        entryKey(entry.orgId, entry.workspaceId, entry.kind, entry.ref),
      );
      removed.push(entry);
      total -= entry.sizeBytes;
      freed += entry.sizeBytes;
    }
    if (removed.length > 0) {
      this.schedulePersist();
      await this.flushPersistLocked();
    }
    this.emitRemoved(removed, reason);
    return freed;
  }

  private emitRemoved(removed: IndexEntry[], reason: EvictionReason): void {
    for (const e of removed) {
      this.emitter.emit("evicted", {
        scope: {
          orgId: e.orgId as OrgId,
          workspaceId: e.workspaceId as WorkspaceId,
          kind: e.kind,
        },
        ref: e.ref as BlobRef,
        sizeBytes: e.sizeBytes,
        reason,
      });
    }
  }
}

