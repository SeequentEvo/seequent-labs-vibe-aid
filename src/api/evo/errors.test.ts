import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  EvoApiError,
  EvoNetworkError,
  EvoSchemaError,
  evoStructuredErrorSchema,
} from "./errors";

describe("evoStructuredErrorSchema", () => {
  it("parses a typical RFC 7807 body", () => {
    const body = {
      type: "https://example.com/probs/out-of-credit",
      title: "You do not have enough credit.",
      status: 403,
      detail: "Your current balance is 30, but that costs 50.",
      instance: "/account/12345/msgs/abc",
    };
    expect(evoStructuredErrorSchema.parse(body)).toEqual(body);
  });

  it("preserves unknown extra fields (passthrough)", () => {
    const body = { title: "x", some_extra_field: 42, nested: { ok: true } };
    expect(evoStructuredErrorSchema.parse(body)).toEqual(body);
  });

  it("accepts an empty object", () => {
    expect(evoStructuredErrorSchema.parse({})).toEqual({});
  });

  it("rejects non-object input", () => {
    expect(evoStructuredErrorSchema.safeParse("string").success).toBe(false);
    expect(evoStructuredErrorSchema.safeParse(null).success).toBe(false);
  });
});

describe("EvoApiError", () => {
  it("constructs with all fields and is an Error", () => {
    const err = new EvoApiError({
      status: 404,
      body: { title: "Not Found", detail: "object missing" },
      rawBody: '{"title":"Not Found"}',
      url: "https://hub/api/x",
      method: "GET",
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(EvoApiError);
    expect(err.name).toBe("EvoApiError");
    expect(err.status).toBe(404);
    expect(err.body).toEqual({ title: "Not Found", detail: "object missing" });
    expect(err.rawBody).toBe('{"title":"Not Found"}');
    expect(err.url).toBe("https://hub/api/x");
    expect(err.method).toBe("GET");
    expect(err.message).toContain("404");
    expect(err.message).toContain("GET");
    expect(err.message).toContain("https://hub/api/x");
    expect(err.message).toContain("object missing");
  });

  it("handles null body / rawBody", () => {
    const err = new EvoApiError({
      status: 500,
      body: null,
      rawBody: null,
      url: "https://hub/api/y",
      method: "POST",
    });
    expect(err.body).toBeNull();
    expect(err.rawBody).toBeNull();
    expect(err.message).toContain("500");
  });
});

describe("EvoNetworkError", () => {
  it("wraps the cause and is an Error", () => {
    const cause = new TypeError("fetch failed");
    const err = new EvoNetworkError({
      url: "https://hub/api",
      method: "GET",
      cause,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(EvoNetworkError);
    expect(err.name).toBe("EvoNetworkError");
    expect(err.cause).toBe(cause);
    expect(err.message).toContain("https://hub/api");
    expect(err.message).toContain("GET");
    expect(err.message).toContain("fetch failed");
  });

  it("stringifies non-Error causes", () => {
    const err = new EvoNetworkError({
      url: "https://hub/api",
      method: "GET",
      cause: "boom",
    });
    expect(err.message).toContain("boom");
  });
});

describe("EvoSchemaError", () => {
  it("wraps a ZodError and surfaces a brief summary", () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const result = schema.safeParse({ age: "nope" });
    if (result.success) throw new Error("expected failure");
    const err = new EvoSchemaError({
      url: "https://hub/api/z",
      zodError: result.error,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(EvoSchemaError);
    expect(err.name).toBe("EvoSchemaError");
    expect(err.zodError).toBe(result.error);
    expect(err.url).toBe("https://hub/api/z");
    expect(err.message).toContain("https://hub/api/z");
    expect(err.message.length).toBeGreaterThan(0);
  });
});
