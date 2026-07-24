---
name: evo-files
description: >
  Understand and use the Evo File API to upload, download, list, and delete files in an Evo
  workspace. Use this skill when someone asks about file storage, file uploads, file downloads,
  pre-signed URLs, file versioning, file metadata, listing files in a workspace, or deleting
  files. Also use when the user needs to integrate file management into their app or handle
  large file uploads.
---

# Evo Files

The File API lets you store and manage files of any type or size within an Evo workspace.
Files are versioned — updating a file creates a new version, and the latest version is
returned by default. Files can be referenced by UUID or by a user-defined file path.

Under the hood, file transfers use pre-signed Azure Blob Storage URLs. The template
provides helper patterns that abstract this away — app code should just call
`uploadFile()` / `downloadFile()` without needing to know about signed URLs or blob
storage.

For instance discovery and hub URL resolution, see the **evo-discovery** skill.
For OAuth scopes, see the **evo-scopes** skill.
For workspace selection (required before using files), see the **evo-workspaces** skill.

## API base URL

All File API requests use the **hub URL** resolved through the Discovery API (see
**evo-discovery** skill), with paths scoped to a workspace:

```
{hub_url}/file/v2/orgs/{org_id}/workspaces/{workspace_id}/files
```

Requires the `evo.file` scope.

## Reference files

Read the relevant reference file for domain-specific patterns and guidance:

- 📄 **[references/uploading.md](references/uploading.md)** — file upload flow
  (register → transfer → poll), resumable uploads
- 📄 **[references/downloading.md](references/downloading.md)** — file download flow,
  URL expiry
- 📄 **[references/file-management.md](references/file-management.md)** — file addressing
  (UUID vs path), listing, deleting, versioning
- 📄 **[references/file-metadata.md](references/file-metadata.md)** — file-specific
  metadata fields and UI presentation ideas
- 📄 **[references/openapi.yaml](references/openapi.yaml)** — OpenAPI spec for validating
  endpoints, parameters, and schemas (re-fetch periodically)

## Related skills

- **evo-blob-transfers** — chunked upload/download mechanics (Azure Block Blob, Range
  requests, parallelism). The file upload and download references above cover the
  File API workflow; use evo-blob-transfers for the underlying binary transfer patterns.
- **evo-resources** — common rules for presenting metadata to end users (UUID
  handling, version labels, date formatting) and constructing stable resource URLs. The
  file-metadata reference above covers file-specific fields; use evo-resources for the
  shared presentation rules.
- **evo-pagination** — common `limit`/`offset` pagination patterns for list endpoints.

## Known discrepancies

The guide documentation and API reference occasionally disagree on field names. For
example, the guide uses `author` for the uploader, while the API schema uses `created_by`.
When in doubt, the [API reference](https://developer.seequent.com/docs/api/file/filev2)
is authoritative.

`version_id` is serialized as a **string** in the API. Treat it as an opaque identifier.

File `name`/`path` semantics differ from the Geoscience Object API (no
`.json`, case-insensitive, broader charset, no body-side `name`). The
display rule is shared: default to the **full path** (`${path}/${name}`)
in summative views; basename alone only when context permits. See
**[references/file-management.md](references/file-management.md#differences-from-object-paths)**
for the side-by-side comparison.

## API reference (single source of truth)

Always retrieve endpoint signatures, request/response schemas, and parameter details
from the API reference. This skill documents patterns and known pitfalls, but the API
reference is authoritative for exact API behaviour.

- [File API — Introduction](https://developer.seequent.com/docs/api/file/file-api)
- [File API — Files](https://developer.seequent.com/docs/api/file/filev2) — all endpoints
- [File API — Release Notes](https://developer.seequent.com/docs/api/file/release-notes)
- [Guides](https://developer.seequent.com/docs/guides/file) — conceptual walkthroughs
- [OpenAPI spec (YAML)](https://developer.seequent.com/api-schemas/file-v2.yaml)

### Local OpenAPI spec

A copy of the OpenAPI spec is stored at [`references/openapi.yaml`](references/openapi.yaml)
for quick reference when validating endpoints, parameters, and schemas.

**This file should be re-fetched periodically** to ensure it reflects the latest API version.
To refresh, overwrite it from the canonical URL:

```
curl -o references/openapi.yaml https://developer.seequent.com/api-schemas/file-v2.yaml
```
