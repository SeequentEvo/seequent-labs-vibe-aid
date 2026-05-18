/**
 * Typed error hierarchy for Evo API helpers.
 *
 * - `EvoApiError` — non-2xx response from the API; preserves the structured
 *   RFC 7807 problem-details body when present.
 * - `EvoNetworkError` — transport-level failure (fetch rejected); wraps the
 *   underlying cause.
 * - `EvoSchemaError` — successful HTTP response whose body did not match the
 *   caller-supplied Zod schema.
 *
 * The `EvoStructuredError` schema is permissive on purpose: Evo may add new
 * problem-details fields and we never want a structured-error body to fail
 * to parse.
 */

import { z } from "zod";
import type { ZodError } from "zod";

/** RFC 7807 problem-details shape, with extra fields preserved. */
export const evoStructuredErrorSchema = z.looseObject({
  type: z.string().optional(),
  title: z.string().optional(),
  status: z.number().optional(),
  detail: z.string().optional(),
  instance: z.string().optional(),
});

export type EvoStructuredError = z.infer<typeof evoStructuredErrorSchema>;

/** Non-2xx response from the Evo API. */
export class EvoApiError extends Error {
  override readonly name = "EvoApiError";
  readonly status: number;
  readonly body: EvoStructuredError | null;
  readonly rawBody: string | null;
  readonly url: string;
  readonly method: string;

  constructor(args: {
    status: number;
    body: EvoStructuredError | null;
    rawBody: string | null;
    url: string;
    method: string;
  }) {
    const detail = args.body?.detail ?? args.body?.title;
    const suffix = detail ? `: ${detail}` : "";
    super(`Evo API ${String(args.status)} ${args.method} ${args.url}${suffix}`);
    this.status = args.status;
    this.body = args.body;
    this.rawBody = args.rawBody;
    this.url = args.url;
    this.method = args.method;
  }
}

/** Transport-level failure (fetch rejected — e.g. DNS, offline, CORS). */
export class EvoNetworkError extends Error {
  override readonly name = "EvoNetworkError";
  override readonly cause: unknown;

  constructor(args: { url: string; method: string; cause: unknown }) {
    const causeMsg =
      args.cause instanceof Error ? args.cause.message : String(args.cause);
    super(
      `Evo network error on ${args.method} ${args.url}: ${causeMsg}`,
    );
    this.cause = args.cause;
  }
}

/** Response body did not match the caller-supplied Zod schema. */
export class EvoSchemaError extends Error {
  override readonly name = "EvoSchemaError";
  readonly zodError: ZodError;
  readonly url: string;

  constructor(args: { url: string; zodError: ZodError }) {
    const summary = args.zodError.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    const more =
      args.zodError.issues.length > 3
        ? ` (+${String(args.zodError.issues.length - 3)} more)`
        : "";
    super(`Evo response schema mismatch at ${args.url}: ${summary}${more}`);
    this.zodError = args.zodError;
    this.url = args.url;
  }
}
