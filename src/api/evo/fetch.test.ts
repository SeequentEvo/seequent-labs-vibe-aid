import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { assertOk, evoFetch } from "./fetch";
import { EvoApiError, EvoNetworkError, EvoSchemaError } from "./errors";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function jsonResponse(
  status: number,
  body: unknown,
  init: { headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

function textResponse(
  status: number,
  body: string,
  contentType = "text/html",
): Response {
  return new Response(body, {
    status,
    headers: { "content-type": contentType },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const URL_ = "https://hub.example.com/api/thing";
const TOKEN = "tok-abc";

describe("evoFetch — success", () => {
  it("200 with schema → ok with parsed data", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: "x", n: 7 }));
    const schema = z.object({ id: z.string(), n: z.number() });
    const result = await evoFetch({ url: URL_, accessToken: TOKEN, schema });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ id: "x", n: 7 });
    expect(result.error).toBeNull();
  });

  it("200 without schema → ok with raw JSON as unknown", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { hello: "world" }));
    const result = await evoFetch({ url: URL_, accessToken: TOKEN });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toEqual({ hello: "world" });
  });

  it("204 No Content → ok with data: undefined", async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(204));
    const result = await evoFetch({ url: URL_, accessToken: TOKEN });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.status).toBe(204);
    expect(result.data).toBeUndefined();
  });

  it("200 with content-length 0 → ok with data: undefined", async () => {
    const r = new Response("", {
      status: 200,
      headers: { "content-length": "0" },
    });
    fetchMock.mockResolvedValueOnce(r);
    const result = await evoFetch({ url: URL_, accessToken: TOKEN });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toBeUndefined();
  });
});

describe("evoFetch — non-2xx", () => {
  it("400 with structured RFC 7807 body → ok:false, error populated", async () => {
    const problem = {
      type: "https://example.com/p",
      title: "Bad Request",
      status: 400,
      detail: "missing field foo",
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(400, problem));
    const result = await evoFetch({ url: URL_, accessToken: TOKEN });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(400);
    expect(result.error).toEqual(problem);
    expect(result.rawBody).toBe(JSON.stringify(problem));
    expect(result.data).toBeNull();
  });

  it("500 with HTML body (not JSON) → ok:false, error null, rawBody set", async () => {
    fetchMock.mockResolvedValueOnce(
      textResponse(500, "<html>boom</html>", "text/html"),
    );
    const result = await evoFetch({ url: URL_, accessToken: TOKEN });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(500);
    expect(result.error).toBeNull();
    expect(result.rawBody).toBe("<html>boom</html>");
  });
});

describe("evoFetch — exceptional", () => {
  it("network failure → throws EvoNetworkError", async () => {
    const cause = new TypeError("fetch failed");
    fetchMock.mockRejectedValueOnce(cause);
    let caught: unknown;
    try {
      await evoFetch({ url: URL_, accessToken: TOKEN });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(EvoNetworkError);
    expect((caught as EvoNetworkError).cause).toBe(cause);
  });

  it("schema validation failure on 200 → throws EvoSchemaError", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 7 }));
    const schema = z.object({ id: z.string() });
    let caught: unknown;
    try {
      await evoFetch({ url: URL_, accessToken: TOKEN, schema });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(EvoSchemaError);
    expect((caught as EvoSchemaError).url).toBe(URL_);
  });

  it("invalid JSON on 200 → throws EvoSchemaError", async () => {
    fetchMock.mockResolvedValueOnce(
      textResponse(200, "not-json", "application/json"),
    );
    let caught: unknown;
    try {
      await evoFetch({ url: URL_, accessToken: TOKEN });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(EvoSchemaError);
  });
});

describe("evoFetch — request shape", () => {
  it("sends Authorization Bearer token and Accept JSON", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
    await evoFetch({ url: URL_, accessToken: TOKEN });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe(URL_);
    const init = call[1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers.Accept).toBe("application/json");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("adds Content-Type and JSON-serialises body when present", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
    await evoFetch({
      url: URL_,
      accessToken: TOKEN,
      method: "POST",
      body: { a: 1, b: "two" },
    });
    const init = fetchMock.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ a: 1, b: "two" }));
  });

  it("merges custom headers (caller wins on collisions)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
    await evoFetch({
      url: URL_,
      accessToken: TOKEN,
      headers: { "X-Foo": "bar", Accept: "application/vnd.custom+json" },
    });
    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["X-Foo"]).toBe("bar");
    expect(headers.Accept).toBe("application/vnd.custom+json");
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("propagates AbortSignal", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
    const ctrl = new AbortController();
    await evoFetch({ url: URL_, accessToken: TOKEN, signal: ctrl.signal });
    expect(fetchMock.mock.calls[0]![1]!.signal).toBe(ctrl.signal);
  });
});

// ---------------------------------------------------------------------------
// gzip compression helper
// ---------------------------------------------------------------------------

async function gzipDecompress(compressed: Uint8Array): Promise<string> {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(compressed);
      controller.close();
    },
  });
  const decompressed = stream.pipeThrough(new DecompressionStream("gzip"));
  const reader = decompressed.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return new TextDecoder().decode(
    chunks.reduce((acc, c) => {
      const merged = new Uint8Array(acc.byteLength + c.byteLength);
      merged.set(acc);
      merged.set(c, acc.byteLength);
      return merged;
    }, new Uint8Array(0)),
  );
}

describe("evoFetch — gzip compression", () => {
  it("gzip: true with large body sends Content-Encoding: gzip and compressed Uint8Array", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    // Build an object whose JSON representation exceeds 1024 bytes.
    const largeBody = { data: "x".repeat(2000) };
    await evoFetch({
      url: URL_,
      accessToken: TOKEN,
      method: "POST",
      body: largeBody,
      gzip: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0]!;
    const init = call[1]!;
    const headers = init.headers as Record<string, string>;

    expect(headers["Content-Encoding"]).toBe("gzip");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBeInstanceOf(Uint8Array);

    // Round-trip: decompress and verify original JSON.
    const decompressed = await gzipDecompress(init.body as Uint8Array);
    expect(decompressed).toBe(JSON.stringify(largeBody));
  });

  it("gzip: true with small body sends plain JSON without Content-Encoding", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const smallBody = { a: 1 };
    await evoFetch({
      url: URL_,
      accessToken: TOKEN,
      method: "POST",
      body: smallBody,
      gzip: true,
    });

    const init = fetchMock.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;

    expect(headers["Content-Encoding"]).toBeUndefined();
    expect(init.body).toBe(JSON.stringify(smallBody));
  });

  it("gzip: false/undefined sends plain JSON (existing behaviour)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const body = { hello: "world" };
    await evoFetch({
      url: URL_,
      accessToken: TOKEN,
      method: "POST",
      body,
    });

    const init = fetchMock.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;

    expect(headers["Content-Encoding"]).toBeUndefined();
    expect(init.body).toBe(JSON.stringify(body));
  });
});

describe("assertOk", () => {
  it("returns data on ok:true", () => {
    const data = assertOk(
      { ok: true, status: 200, data: { x: 1 }, error: null },
      { url: URL_, method: "GET" },
    );
    expect(data).toEqual({ x: 1 });
  });

  it("throws EvoApiError on ok:false with structured error and context", () => {
    const error = { title: "Conflict", detail: "version mismatch" };
    let caught: unknown;
    try {
      assertOk(
        {
          ok: false,
          status: 409,
          data: null,
          error,
          rawBody: JSON.stringify(error),
        },
        { url: URL_, method: "PATCH" },
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(EvoApiError);
    const api = caught as EvoApiError;
    expect(api.status).toBe(409);
    expect(api.url).toBe(URL_);
    expect(api.method).toBe("PATCH");
    expect(api.body).toEqual(error);
    expect(api.rawBody).toBe(JSON.stringify(error));
  });
});
