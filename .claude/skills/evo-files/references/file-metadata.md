# File Metadata & Presentation

> **API reference**: [File API — Files](https://developer.seequent.com/docs/api/file/filev2)
> | **Common rules**: See the **evo-resources** skill for shared presentation
> guidelines (UUID handling, version labels, date formatting, etc.)

The File API returns rich metadata with every file response. This reference discusses
file-specific fields and ideas for presenting them to users.

## Available metadata

See the [API reference](https://developer.seequent.com/docs/api/file/filev2) for the
authoritative schema. Key fields that are useful for UI presentation include:

- **Identity**: `file_id`, `name`, `path`
- **Size**: `size` (bytes)
- **Timestamps**: `created_at`, `modified_at`
- **People**: `created_by` and `modified_by` (each with `id`, `name`, `email`)
- **Versioning**: `version_id`, and the `versions` array (when requested with
  `?include_versions=true`)

> **Note**: The guide documentation uses `author` for the uploader field, but the API
> schema uses `created_by`. See the SKILL.md "Known discrepancies" section.

### Fields to avoid exposing directly

See the **evo-resources** skill for the general rules. For files specifically:

- **`version_id`** — opaque string. Use the version's date as the label instead.
- **`file_id`** — never display. Provide a "Copy link" action for the UUID-based URI.
- **`etag`** — omit entirely from user-facing views.

## Presentation ideas

The right presentation depends entirely on the use case. Here are some starting points:

### File browser / explorer

A table or grid showing files in a workspace — good for general-purpose file management.
Useful columns: name, size (human-readable), modified date (relative or absolute),
modified by (name or avatar). Consider sortable columns and a search/filter bar backed
by the list endpoint's query parameters.

### Activity feed

Show recent file activity across a workspace — who uploaded what and when. Focus on
`created_by`/`modified_by` names, timestamps, and file names. Group by date or by user.
The list endpoint's `created_at` filter can scope this to a time window.

### Version history

For a single file, show its version timeline using `?include_versions=true`. Each
version entry includes `created_at`, `created_by`, `size`, and a download `link`.
Present as a vertical timeline or table — useful for audit trails, rollback UIs, or
diffing between versions.

### Detail panel / inspector

A side panel or modal showing full metadata for a selected file. Include name, path,
size, created/modified timestamps, uploader/modifier names, `etag`, and a direct
download link. This works well alongside a file browser for "select to inspect" patterns.

### Cards / thumbnails

For file types with visual previews (images, PDFs), show a card with a thumbnail,
file name, and key metadata (size, date). The File API itself doesn't generate
thumbnails — the app would need to download and render previews for supported formats.

### Minimal reference

Sometimes files are just referenced within a custom workflow or alongside other content.
In these cases, showing just the file name as a clickable download link — possibly with
size or date as secondary text — keeps the UI clean.

## Formatting tips

See the **evo-resources** skill for the full set of common formatting rules.
File-specific notes:

- **Paths**: the `path` field represents the directory (e.g., `/data/surveys/`). Combined
  with `name`, it gives the full file path — useful for breadcrumb navigation or
  folder-based grouping.
- **UUIDs**: never show raw UUIDs in the UI. Provide a "Copy link" or "Copy reference"
  action that copies the UUID-based resource URL — this is the most stable form and is
  preferred by SDKs (e.g., the Python SDK accepts both UUID and path-based URIs, but
  UUID references are most preferred).
- **Versions**: label versions by their **date** (e.g., "Apr 12, 2025") rather than
  sequential numbers (v1, v2…). Sequential numbering becomes unreliable if intermediate
  versions are deleted — dates remain stable regardless of what happens to other versions.
  Label the most recent version as **"Latest"** to give clear orientation.
