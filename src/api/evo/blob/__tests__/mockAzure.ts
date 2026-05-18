/**
 * In-memory simulation of an Azure Block-Blob endpoint for integration tests.
 *
 * Speaks the subset of the protocol the chunked transfer helpers actually use:
 *  - `PUT  ?comp=block&blockid=…`  → record a staged block under the URL path.
 *  - `PUT  ?comp=blocklist`        → parse `<Latest>…</Latest>` items and
 *                                    assemble the final blob under the path.
 *  - `GET  <url>` with `Range: bytes=N-M` → 206 with the byte slice.
 *  - `GET  <url>` (no Range)        → 200 with the full blob.
 *
 * Counters track every fetch so tests can assert short-circuiting / dedup.
 */

interface BlockMap {
  readonly blocks: Map<string, Uint8Array>;
}

export interface MockAzureCallCounts {
  /** All fetches grouped by URL path. */
  readonly all: ReadonlyMap<string, number>;
  /** GETs (downloads) grouped by URL path. */
  readonly gets: ReadonlyMap<string, number>;
  /** PUTs grouped by URL path (block + blocklist combined). */
  readonly puts: ReadonlyMap<string, number>;
}

export interface MockAzureOptions {
  /** Optional delay applied to every fetch (ms) — useful for racing aborts. */
  readonly delayMs?: number;
}

export class MockAzureServer {
  readonly #blobs = new Map<string, Uint8Array>();
  readonly #stagings = new Map<string, BlockMap>();
  readonly #all = new Map<string, number>();
  readonly #gets = new Map<string, number>();
  readonly #puts = new Map<string, number>();
  #delayMs: number;

  constructor(options: MockAzureOptions = {}) {
    this.#delayMs = options.delayMs ?? 0;
  }

  setDelay(ms: number): void {
    this.#delayMs = ms;
  }

  /** Register a pre-existing blob so download-only tests can fetch it. */
  preload(path: string, bytes: Uint8Array): void {
    this.#blobs.set(path, new Uint8Array(bytes));
  }

  /** A pre-signed URL pointing at a path on this mock server. */
  urlFor(path: string): string {
    return `https://mock.blob.test${path}?sv=2024&sig=stub`;
  }

  get counts(): MockAzureCallCounts {
    return { all: this.#all, gets: this.#gets, puts: this.#puts };
  }

  /** A `fetch`-shaped function bound to this server. */
  readonly fetch: typeof fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const urlStr =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const url = new URL(urlStr);
    const path = url.pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    const signal = init?.signal ?? undefined;

    bump(this.#all, path);
    if (method === "GET") bump(this.#gets, path);
    if (method === "PUT") bump(this.#puts, path);

    if (signal?.aborted) {
      throw new DOMException("aborted", "AbortError");
    }

    if (this.#delayMs > 0) {
      await abortableDelay(this.#delayMs, signal);
    }

    const comp = url.searchParams.get("comp");

    if (method === "PUT" && comp === "block") {
      const blockId = url.searchParams.get("blockid") ?? "";
      const bytes = await readBody(init?.body);
      let staging = this.#stagings.get(path);
      if (!staging) {
        staging = { blocks: new Map<string, Uint8Array>() };
        this.#stagings.set(path, staging);
      }
      staging.blocks.set(blockId, bytes);
      return new Response(null, { status: 201 });
    }

    if (method === "PUT" && comp === "blocklist") {
      const xml = typeof init?.body === "string" ? init.body : "";
      const ids = [...xml.matchAll(/<Latest>([^<]+)<\/Latest>/g)]
        .map((m) => m[1])
        .filter((s): s is string => typeof s === "string");
      const staging = this.#stagings.get(path);
      let total = 0;
      for (const id of ids) total += staging?.blocks.get(id)?.byteLength ?? 0;
      const out = new Uint8Array(total);
      let cursor = 0;
      for (const id of ids) {
        const b = staging?.blocks.get(id);
        if (!b) continue;
        out.set(b, cursor);
        cursor += b.byteLength;
      }
      this.#blobs.set(path, out);
      this.#stagings.delete(path);
      return new Response(null, { status: 201 });
    }

    if (method === "GET") {
      const blob = this.#blobs.get(path);
      if (!blob) return new Response("not found", { status: 404 });

      const range = new Headers(init?.headers).get("Range");
      if (!range) {
        const full = new Uint8Array(blob);
        return new Response(full, { status: 200 });
      }
      const m = /^bytes=(\d+)-(\d+)$/.exec(range);
      if (!m) {
        return new Response("bad range", { status: 400 });
      }
      const from = Number(m[1]);
      const to = Number(m[2]);
      const slice = new Uint8Array(blob.slice(from, to + 1));
      return new Response(slice, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${String(from)}-${String(to)}/${String(blob.byteLength)}`,
        },
      });
    }

    return new Response(null, { status: 405 });
  };
}

const bump = (m: Map<string, number>, key: string): void => {
  m.set(key, (m.get(key) ?? 0) + 1);
};

const abortableDelay = (ms: number, signal: AbortSignal | undefined): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const readBody = async (body: BodyInit | null | undefined): Promise<Uint8Array> => {
  if (body == null) return new Uint8Array(0);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  if (typeof body === "string") return new TextEncoder().encode(body);
  return new Uint8Array(0);
};
