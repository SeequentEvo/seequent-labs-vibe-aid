/**
 * `evoFetch` — central HTTP middleware for Evo API calls.
 *
 * Returns a discriminated `EvoResult<T>`:
 * - 2xx → `{ ok: true, status, data, error: null }`. If a Zod schema is given,
 *   the body is validated; otherwise `data` is the raw parsed JSON.
 * - non-2xx → `{ ok: false, status, data: null, error, rawBody }` where `error`
 *   is the parsed RFC 7807 body (or `null` if it wasn't JSON / didn't parse).
 *
 * The non-2xx branch returns rather than throws because some callers treat
 * specific statuses as expected (e.g. 404 for "does this object exist?",
 * 409/412 for optimistic-concurrency checks).
 *
 * Transport failures (fetch rejects) and schema-validation failures on a 2xx
 * body remain exceptional — they throw `EvoNetworkError` and `EvoSchemaError`
 * respectively.
 *
 * Use `assertOk` at call sites that want the simple "throw on non-2xx" flow.
 */

import { z } from "zod";
import type { ZodType } from "zod";
import {
  EvoApiError,
  EvoNetworkError,
  EvoSchemaError,
  evoStructuredErrorSchema,
} from "./errors";
import type { EvoStructuredError } from "./errors";

export type EvoMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface EvoOk<T> {
  ok: true;
  status: number;
  data: T;
  error: null;
}

export interface EvoErr {
  ok: false;
  status: number;
  data: null;
  error: EvoStructuredError | null;
  rawBody: string | null;
}

export type EvoResult<T> = EvoOk<T> | EvoErr;

export interface EvoFetchOptions<T> {
  url: string;
  method?: EvoMethod;
  accessToken: string;
  body?: unknown;
  schema?: ZodType<T>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** When true, gzip-compress JSON bodies ≥ 1 024 bytes before sending. */
  gzip?: boolean;
}

const GZIP_THRESHOLD = 1024;

async function gzipCompress(data: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(data));
      controller.close();
    },
  });
  const compressed = readable.pipeThrough(new CompressionStream("gzip"));
  const reader = compressed.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function isBodyEmpty(response: Response, text: string): boolean {
  if (response.status === 204) return true;
  if (text.length === 0) return true;
  const cl = response.headers.get("content-length");
  return cl === "0";
}

function tryParseStructuredError(
  text: string,
): { body: EvoStructuredError | null; rawBody: string | null } {
  if (text.length === 0) {
    return { body: null, rawBody: null };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { body: null, rawBody: text };
  }
  const parsed = evoStructuredErrorSchema.safeParse(json);
  if (parsed.success) {
    return { body: parsed.data, rawBody: text };
  }
  return { body: null, rawBody: text };
}

export async function evoFetch<T = unknown>(
  opts: EvoFetchOptions<T>,
): Promise<EvoResult<T>> {
  const method: EvoMethod = opts.method ?? "GET";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.accessToken}`,
    Accept: "application/json",
    ...(opts.headers ?? {}),
  };

  let bodyInit: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] ??= "application/json";
    const json = JSON.stringify(opts.body);
    if (opts.gzip && json.length >= GZIP_THRESHOLD) {
      // gzipCompress returns Uint8Array<ArrayBufferLike>; the DOM lib's BodyInit
      // only accepts Uint8Array<ArrayBuffer>. Runtime accepts either — cast is safe.
      bodyInit = (await gzipCompress(json)) as BodyInit;
      headers["Content-Encoding"] = "gzip";
    } else {
      bodyInit = json;
    }
  }

  let response: Response;
  try {
    response = await fetch(opts.url, {
      method,
      headers,
      body: bodyInit,
      signal: opts.signal,
    });
  } catch (cause) {
    throw new EvoNetworkError({ url: opts.url, method, cause });
  }

  const text = await response.text();

  if (response.ok) {
    if (isBodyEmpty(response, text)) {
      return {
        ok: true,
        status: response.status,
        data: undefined as T,
        error: null,
      };
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (cause) {
      const zodError = new z.ZodError([
        {
          code: "custom",
          path: [],
          message: `Response body was not valid JSON: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
          input: text,
        },
      ]);
      throw new EvoSchemaError({ url: opts.url, zodError });
    }

    if (opts.schema) {
      const parsed = opts.schema.safeParse(json);
      if (!parsed.success) {
        throw new EvoSchemaError({ url: opts.url, zodError: parsed.error });
      }
      return { ok: true, status: response.status, data: parsed.data, error: null };
    }

    return {
      ok: true,
      status: response.status,
      data: json as T,
      error: null,
    };
  }

  const { body, rawBody } = tryParseStructuredError(text);
  return {
    ok: false,
    status: response.status,
    data: null,
    error: body,
    rawBody,
  };
}

/** Throws `EvoApiError` on a non-2xx result; returns `data` on success. */
export function assertOk<T>(
  result: EvoResult<T>,
  context: { url: string; method: string },
): T {
  if (result.ok) return result.data;
  throw new EvoApiError({
    status: result.status,
    body: result.error,
    rawBody: result.rawBody,
    url: context.url,
    method: context.method,
  });
}
