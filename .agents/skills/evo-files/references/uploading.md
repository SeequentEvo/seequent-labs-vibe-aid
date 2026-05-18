# Uploading Files

> **API reference**: [File API — Files](https://developer.seequent.com/docs/api/file/filev2)
> | **Guide**: [Uploading a File](https://developer.seequent.com/docs/guides/file/uploading-a-file)

Uploading is a three-step process: register the upload, transfer the data, then poll
until the file is ready. See the
[guide](https://developer.seequent.com/docs/guides/file/uploading-a-file) for the
full walkthrough and example responses.

## High-level flow

1. **Register** — PUT to the file endpoint to get a pre-signed Azure Blob Storage URL
2. **Transfer** — upload the file data to the pre-signed URL (no auth header needed)
3. **Poll** — GET the file endpoint until metadata is returned

The pre-signed upload URL is valid for **30 minutes**.

## Transfer mechanics

For the actual binary transfer (step 2), see the **evo-blob-transfers** skill. It
covers simple uploads for small files and chunked uploads (Azure Block Blob) for large
files, including parallel chunk uploads and retry.

## Polling for completion

The file may not be immediately available after upload. Poll the GET file endpoint until
file metadata is returned. When uploading a new version of an existing file, compare
the `version_id` from the registration step with the one returned by the poll to detect
when the new version is available. See the
[guide](https://developer.seequent.com/docs/guides/file/uploading-a-file) for the
polling example.

## Resuming failed uploads

If an upload is interrupted (e.g., browser closed mid-upload), the **uncommitted blocks**
remain valid in Azure Blob Storage for **up to one week**. You can resume by passing
the original `version_id` to the upload endpoint to get a new pre-signed URL for the
same blob, then re-upload any missing chunks and commit the block list.
