# Downloading Files

> **API reference**: [File API — Files](https://developer.seequent.com/docs/api/file/filev2)
> | **Guide**: [Downloading a File](https://developer.seequent.com/docs/guides/file/downloading-a-file)

To download a file, GET the file endpoint (by path or UUID) to receive file metadata
including a pre-signed download URL. See the
[guide](https://developer.seequent.com/docs/guides/file/downloading-a-file) for the
full walkthrough. The `download` field contains a pre-signed URL valid for **30 minutes**
that requires no Authorization header.

## Simple download

For files that will comfortably download within the 30-minute URL window, use a direct
fetch or browser-triggered download.

### Direct link

Render the pre-signed URL as a clickable link or trigger it programmatically:

```typescript
// Trigger a browser download
const a = document.createElement("a");
a.href = file.download;
a.download = file.name;
a.click();
```

### Fetch and process

When the app needs to process file contents (e.g., parse a CSV, render an image), fetch
the pre-signed URL directly:

```typescript
const res = await fetch(file.download);
const blob = await res.blob();
```

No Authorization header is needed on the pre-signed URL itself — only on the initial
metadata request that returns the URL.

## Chunked download (large files)

For large files or when download speed is uncertain, see the **evo-blob-transfers**
skill for chunked download using HTTP Range requests. This enables parallel downloads,
resumability, and per-chunk progress tracking. Use the file's `size` field from
metadata to determine the total size — no extra HEAD request needed.

## URL expiry

Pre-signed download URLs are valid for **30 minutes**. If a download link may go stale
(e.g., displayed in a long-lived UI), re-fetch the file metadata to get a fresh URL
before initiating the download.
