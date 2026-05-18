# Object Management

> **API reference**: [Objects](https://developer.seequent.com/docs/api/geoscience-object/objects)
> | **Guide**: [Upload Object](https://developer.seequent.com/docs/guides/objects/upload-object)
> | [Download Object](https://developer.seequent.com/docs/guides/objects/download-object)
> | [Update Object](https://developer.seequent.com/docs/guides/objects/update-object)

## Addressing

Objects can be referenced by **UUID** (`object_id`) or by a user-defined **path**.

- **Create by path**: POST to `.../objects/path/{object_path}` with `uuid: null` — the
  service assigns a UUID and returns it.
- **Update by UUID**: POST to `.../objects/{object_id}` — replaces the entire object
  (no partial updates), creating a new version.
- **Download**: GET by UUID or by path. Note: the `deleted` query parameter is only
  supported on GET-by-UUID, not GET-by-path.
- **Delete**: DELETE by UUID or by path (soft-delete).

## Path and name

The API has **two** path/name concepts. A third field — `object.name`,
inside the body — is object *content*, not the resource's path or
identity.

1. **Canonical wire path** — addresses the object on the URL (e.g.
   `geology/surfaces/topo.json`). Always ends in `.json`.
2. **List `path` + `name` split** — the list endpoint returns the parent
   directory as `path` (e.g. `"/"`) and the filename as `name`
   (e.g. `"topo.json"`, **including `.json`**). Concatenate to recover
   the canonical path.

| Response | Parent dir | Filename (with `.json`) | Full canonical path |
|---|---|---|---|
| `ListedObject` (list) | `path` | `name` | compute as `path + name` |
| `GetObjectResponse` / `PostObjectResponse` | – | trailing segment of `object_path` | `object_path` |
| `ObjectAlreadyExistsError` (409) | – | – | `object_path` |

Worked examples from the official guides:

```jsonc
// List — https://developer.seequent.com/docs/guides/objects/list-geoscience-objects
{ "name": "pointset_demo.json", "path": "/", "object_id": "9fd1cb16-…", … }

// Single GET — https://developer.seequent.com/docs/guides/objects/download-object
{ "object_path": "pointset_demo.json",
  "object_id":   "9fd1cb16-…",
  "object": { "schema": "…", "uuid": "9fd1cb16-…",
              "name":   "Example pointset.",   // body content — not identity
              "description": "…", … } }
```

To recover the canonical path from a list item, join `path` and `name`
(normalise the slash so `"/"` + `"foo.json"` → `"foo.json"`, and
`"/a/b/"` + `"foo.json"` → `"a/b/foo.json"`). From a single GET,
`object_path` is already the full path — do not split and re-join.
Never use `object.name` to build a path.

### What to show the user

For path-based requests, use the canonical wire path.

For display, default to the full canonical path with `.json` stripped
(e.g. `geology/surfaces/topo`). This is the **evo-resources** rule for
all summative views — lists, trees, pickers, search — so users can
distinguish same-named objects in different folders. Showing only the
basename is appropriate only in individualised views (detail page, side
panel, breadcrumb tail), in folder-scoped views where the folder context
is implicit, or where the developer has consciously decided the path is
noise.

`object.name` (the body field) may **additionally** be surfaced in
individual-object detail views as the object's human-readable title. It
must not substitute for the path in summative views, breadcrumbs, "Copy
link", or any request — treat it as body content like `description`.

### Path constraints

Object path identifiers must be ASCII: letters, numbers, and `+-.:=_/`,
plus the required trailing `.json`. Paths are case-sensitive (file paths
are not).

### Move and rename

There is no rename endpoint. To move or rename, upload a new version with
the **same UUID** to a different path. See the
[FAQ](https://developer.seequent.com/docs/guides/objects/faq).

### Common mistakes

1. **Using `object.name` for identity** — paths, requests, lists, "Copy
   link". It is body content; surface it only in detail views.
2. **Showing only the basename in summative views** — two objects can
   share a basename in different folders. Default to the full path.
3. **Including `.json` in displayed paths** — strip it for display,
   reapply for requests.
4. **Treating list `path` as the full canonical path** — it is only the
   parent directory; a list `path` of `"/"` is not addressable on its own.
5. **Reading top-level `name` or `path` on a single GET** — single GETs
   expose only `object_path`. Derive the filename from its trailing
   segment if needed.
6. **Borrowing file-API semantics** — files use `name`+`path` with no
   `.json`, case-insensitive, broader charset, no body-side `name`.
7. **Filter footgun** — `object_name=foo` is a prefix match on the
   filename; `object_name=eq:foo` won't match unless you supply the full
   canonical path including `.json` (e.g. `eq:geology/topo.json`).

## Creating an object

The full workflow is: upload data blobs first (see
[references/data-blobs.md](data-blobs.md)), then upload the object JSON. The object
JSON references data blobs by their SHA-256 hash.

Set `uuid: null` for new objects. The response includes the assigned `object_id` and
`version_id`. Gzip compression is expected (`Content-Encoding: gzip`).

> **Note**: If an object already exists at the specified path, POST-by-path creates a new
> version of it (the object body must include the matching UUID).

See the [upload guide](https://developer.seequent.com/docs/guides/objects/upload-object)
for a complete example with a pointset object.

## Downloading an object

GET by UUID or path returns the object JSON, metadata, and `links`
containing pre-signed download URLs for the object itself and its data blobs.

Optional query parameters:

- `version` — download a specific version instead of the latest.
- `include_versions` — set to `true` to include the `versions` array with the full
  version history in the response (default: `false`).
- `deleted` — set to `true` to download a soft-deleted object (**UUID endpoint only**,
  not supported on GET-by-path).

Request compressed responses with `Accept-Encoding: gzip`.

See the [download guide](https://developer.seequent.com/docs/guides/objects/download-object)
for a complete response example.

## Updating an object

Every upload creates a new version, even if the content is unchanged. Updates are full
replacements — send the complete object JSON.

See the [update guide](https://developer.seequent.com/docs/guides/objects/update-object)
for details.

## Deleting and restoring

DELETE by UUID or path performs a **soft-delete**. Pass `?deleted=true` on list requests
to include deleted objects. Restore a soft-deleted object by POSTing to the UUID endpoint
(`.../objects/{object_id}`) with `?deleted=false`. You cannot provide an object body when
restoring — the request body must be empty. Restore is not available via the path endpoint.

## Versioning

> **Guide**: [Object Versioning](https://developer.seequent.com/docs/guides/objects/object-versioning)

Every upload creates a new version. The object keeps a fixed UUID; each version has its
own `version_id`, `created_at`, and `created_by`. Pass `?include_versions=true` on the
download request to include a `versions` array with the full history (without it,
`versions` is null).

For presentation guidance on version labels, see the **evo-resources** skill
(date-based labels, "Latest" tag — never sequential numbering).

### Batch version check

Check the latest version for up to 500 objects at once:

```
PATCH .../workspaces/{workspace_id}/objects
Content-Type: application/json

["uuid-1", "uuid-2", ...]
```

Returns `[{ "object_id": "...", "version_id": "..." }]`. Objects that don't exist or
are deleted return `version_id: null`.

## Listing objects

> **Guide**: [List Geoscience Objects](https://developer.seequent.com/docs/guides/objects/list-geoscience-objects)
> | **Pagination**: See the **evo-pagination** skill for common patterns.

The list endpoint returns the latest version of each object. Supports `limit`/`offset`
pagination, filtering, and sorting.

Prefer **workspace-level** listing unless the use case explicitly requires cross-workspace
data. The org-level endpoint includes `workspace_id` and `workspace_name` on each object.

Each list entry includes a `geojson_bounding_box` field (GeoJSON Polygon) for spatial
context.

### Filtering

Filter parameters are passed as **query parameters**. Array-typed filters can be
repeated to supply multiple values (e.g., `?schema_id=a&schema_id=b`).

| Parameter | Type | Description |
|-----------|------|-------------|
| `deleted` | boolean | When `true`, return only deleted objects |
| `schema_id` | string[] | Filter by schema. Exact match or `like:` wildcard (e.g., `like:*pointset*`) |
| `object_name` | string[] | Without operator: case-sensitive **prefix** match on filename. With `eq:` operator: exact match on full path (e.g., `eq:path/to/object.json`) |
| `created_by` | uuid[] | Filter by creator's profile UUID |
| `modified_by` | uuid[] | Filter by modifier's profile UUID |
| `deleted_by` | uuid[] | Filter by deleter's profile UUID |
| `created_at` | string[] | Date filter (max 2 values for range). Uses operator prefix: `lt:`, `lte:`, `gt:`, `gte:` (e.g., `gte:2023-03-10T22:56:53Z`). Without operator, equals match (single value only). ISO 8601 format, UTC assumed if no offset. |
| `modified_at` | string[] | Same syntax as `created_at` |
| `deleted_at` | string[] | Same syntax as `created_at` |
| `geojson_bounding_box` | string[] | Spatial filter. 5 coordinate pairs (closed polygon) with optional operator `geowithin:` or `geointersects:` (default). E.g., `geointersects:(171.6,-44.5),(173.7,-44.5),(173.7,-42.9),(171.6,-42.9),(171.6,-44.5)` |

### Sorting

Use `order_by` with a comma-separated list of fields. Prefix with `asc:` or `desc:` to
set direction (ascending is the default):

```
?order_by=object_name,desc:created_at
```

Known sort fields: `author`, `created_at`, `created_by`, `deleted_at`, `modified_at`,
`modified_by`, `object_name`. Arbitrary nested fields are also supported (e.g.,
`asc:object.a.b.c`).
