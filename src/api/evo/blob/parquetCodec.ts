/**
 * Parquet encode/decode wrapper around `parquet-wasm`.
 *
 * Format requirements (per `.agents/skills/evo-objects/references/data-blobs.md`):
 *   - Format version: 2.4 — written using parquet-wasm's `WriterVersion.V2`,
 *     which selects the Parquet 2.x page family (the v2.4 spec is part of
 *     this family; arrow-rs / parquet-wasm only expose `V1` / `V2`).
 *   - Compression: gzip
 *   - Encryption: none (default — never enabled)
 *   - Data page size: 1 MB (parquet-wasm default — left unset)
 *
 * Only the `Table` type from `parquet-wasm` is re-exported. All other
 * library specifics (`WriterPropertiesBuilder`, `Compression`, init
 * lifecycle, …) are kept internal so call sites never depend on the
 * WASM library directly.
 *
 * **Browser-only.** This template targets a Vite SPA. The WASM init below
 * relies on Vite rewriting `import.meta.url` to a real `.wasm` URL in the
 * built bundle. Vitest is browserless, so a setup file
 * (`__tests__/parquetTestSetup.ts`) primes parquet-wasm with bytes read
 * from disk before any test runs; the call to `mod.default()` here then
 * becomes a no-op thanks to wasm-bindgen's internal cache.
 */

import type { Table as ParquetWasmTable } from "parquet-wasm/esm";

/** Re-export of the parquet-wasm `Table` so callers don't import it directly. */
export type Table = ParquetWasmTable;

/** Subset of the parquet-wasm module surface this file actually uses. */
type ParquetModule = typeof import("parquet-wasm/esm");

let modulePromise: Promise<ParquetModule> | undefined;

/** Lazily import parquet-wasm and run its WASM initializer exactly once. */
async function getModule(): Promise<ParquetModule> {
  modulePromise ??= loadModule();
  return modulePromise;
}

async function loadModule(): Promise<ParquetModule> {
  const mod = await import("parquet-wasm/esm");
  await mod.default();
  return mod;
}

/**
 * Lazily import parquet-wasm and ensure its WASM initializer has run.
 * Safe to call from anywhere that needs the module; init only happens once.
 */
export async function getParquetWasmModule(): Promise<ParquetModule> {
  return getModule();
}

/**
 * Encode a parquet-wasm `Table` to gzip-compressed Parquet bytes that
 * conform to Evo's data-blob requirements.
 */
export async function encodeParquet(table: Table): Promise<Uint8Array> {
  const mod = await getModule();
  const properties = new mod.WriterPropertiesBuilder()
    .setCompression(mod.Compression.GZIP)
    .setWriterVersion(mod.WriterVersion.V2)
    .build();
  return mod.writeParquet(table, properties);
}

/** Decode a Parquet byte buffer to a parquet-wasm `Table`. */
export async function decodeParquet(
  bytes: Uint8Array | ArrayBuffer,
): Promise<Table> {
  const mod = await getModule();
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return mod.readParquet(buf);
}

/**
 * Compute the SHA-256 digest of a buffer and return it as lowercase hex.
 *
 * Used by the parquet upload path to derive the client-side `BlobRef` that
 * the Evo Objects API expects (`data-blobs.md`).
 */
export async function sha256Hex(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  let hex = "";
  for (const byte of view) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}
