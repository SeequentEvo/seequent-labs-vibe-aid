/**
 * Vitest setup: pre-initialise `parquet-wasm` with bytes read from disk so
 * the production code's browser-style `mod.default()` (no args) becomes a
 * no-op when tests run.
 *
 * This file is intentionally test-only — production code in
 * `parquetCodec.ts` is browser-only and never reads the filesystem.
 */

import { readFile } from "node:fs/promises";

const mod = await import("parquet-wasm/esm");
const wasmUrl = import.meta.resolve("parquet-wasm/esm/parquet_wasm_bg.wasm");
const bytes = await readFile(new URL(wasmUrl));
await mod.default({ module_or_path: bytes });
