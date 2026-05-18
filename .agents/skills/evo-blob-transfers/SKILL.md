---
name: evo-blob-transfers
description: >
  Reusable patterns for uploading and downloading binary data via Evo pre-signed Azure
  Blob Storage URLs. Use this skill when implementing file uploads, file downloads,
  geoscience object data blob transfers, or any binary transfer involving pre-signed URLs.
  Covers simple and chunked uploads (Azure Block Blob), chunked downloads (Range requests),
  URL expiry, retry, and parallelism. Also use when another Evo skill references
  evo-blob-transfers for binary transfer guidance.
---

# Binary Transfers (Pre-Signed URLs)

Evo APIs use **pre-signed Azure Blob Storage URLs** for binary data transfers. This
skill covers the transport mechanics shared across File uploads/downloads and Geoscience
Object data blob uploads/downloads. Each API has its own workflow for obtaining these
URLs — see the relevant API skill (**evo-files** or **evo-objects**) for the end-to-end
flow.

## Pre-signed URLs

- URLs are **time-limited** (typically 30 minutes) and include a SAS token.
- No `Authorization` header is needed on the pre-signed URL itself — only on the Evo API
  request that returns the URL.
- If a URL expires before the transfer completes, request a new one from the Evo API.
  Existing progress (uploaded blocks, downloaded chunks) is not lost.

## Simple upload

For small payloads that will complete within the URL expiry window:

```typescript
await fetch(uploadUrl, {
  method: "PUT",
  headers: { "x-ms-blob-type": "BlockBlob" },
  body: data,
});
```

## Chunked upload (Azure Block Blob)

For large payloads, use Azure Block Blob chunked uploads. Each chunk is uploaded
individually and then committed as a single blob. This avoids the expiry timeout and
enables parallel uploads.

1. **Put Block** — upload each chunk as a named block
2. **Put Block List** — commit all blocks into the final blob

```typescript
const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MiB per chunk
const MAX_PARALLEL = 4;

async function uploadChunked(uploadUrl: string, data: Blob): Promise<void> {
  const totalChunks = Math.ceil(data.size / CHUNK_SIZE);
  const blockIds: string[] = [];

  for (let i = 0; i < totalChunks; i++) {
    blockIds.push(btoa(String(i).padStart(6, "0")));
  }

  // Upload chunks in parallel batches
  for (let start = 0; start < totalChunks; start += MAX_PARALLEL) {
    const batch = blockIds.slice(start, start + MAX_PARALLEL);
    await Promise.all(
      batch.map((blockId, offset) => {
        const chunkIndex = start + offset;
        const from = chunkIndex * CHUNK_SIZE;
        const to = Math.min(from + CHUNK_SIZE, data.size);
        const chunk = data.slice(from, to);

        const url = new URL(uploadUrl);
        url.searchParams.set("comp", "block");
        url.searchParams.set("blockid", blockId);

        return fetch(url.toString(), { method: "PUT", body: chunk });
      }),
    );
  }

  // Commit all blocks
  const commitUrl = new URL(uploadUrl);
  commitUrl.searchParams.set("comp", "blocklist");

  const blockListXml =
    `<?xml version="1.0" encoding="utf-8"?><BlockList>` +
    blockIds.map((id) => `<Latest>${id}</Latest>`).join("") +
    `</BlockList>`;

  await fetch(commitUrl.toString(), {
    method: "PUT",
    headers: { "Content-Type": "application/xml" },
    body: blockListXml,
  });
}
```

Key details:
- `Blob.slice()` is zero-copy in the browser — it creates a view, not a copy.
- Block IDs must be base64-encoded strings of **equal length** across all blocks.
- Each block can be up to 4 GiB (smaller chunks are better for parallelism).
- 4–8 MiB chunks with 4 parallel uploads is a reasonable default.
- Failed chunks can be retried individually.

## Chunked download (Range requests)

Pre-signed Azure Blob Storage URLs support HTTP **Range requests**. The server responds
with `206 Partial Content`. This enables parallel downloads, resumability, and per-chunk
progress tracking.

```typescript
const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MiB
const MAX_PARALLEL = 4;

async function downloadChunked(
  downloadUrl: string,
  totalSize: number,
): Promise<Blob> {
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
  const chunks: ArrayBuffer[] = new Array(totalChunks);

  for (let start = 0; start < totalChunks; start += MAX_PARALLEL) {
    const batch = Array.from(
      { length: Math.min(MAX_PARALLEL, totalChunks - start) },
      (_, offset) => {
        const chunkIndex = start + offset;
        const from = chunkIndex * CHUNK_SIZE;
        const to = Math.min(from + CHUNK_SIZE - 1, totalSize - 1);

        return fetch(downloadUrl, {
          headers: { Range: `bytes=${from}-${to}` },
        })
          .then((res) => res.arrayBuffer())
          .then((buf) => {
            chunks[chunkIndex] = buf;
          });
      },
    );
    await Promise.all(batch);
  }

  return new Blob(chunks);
}
```

Key details:
- The `Range` header uses inclusive byte ranges: `bytes=0-4194303` = first 4 MiB.
- Azure returns `206 Partial Content` with a `Content-Range` response header.
- Failed chunks can be retried individually.

## Choosing a strategy

| Factor | Simple | Chunked |
|--------|--------|---------|
| Payload size | < ~100 MB | Any size |
| Transfer duration risk | < 30 min | No limit |
| Parallelism | No | Yes |
| Retry granularity | Whole payload | Per chunk |
| Progress tracking | Coarse | Per chunk |
| Complexity | Minimal | Moderate |

Prefer chunked transfers as the default for production apps — they handle all sizes
robustly. Wrap the mechanics in a helper that hides the complexity from domain code.
