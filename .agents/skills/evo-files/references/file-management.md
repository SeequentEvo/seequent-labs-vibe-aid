# File Management

> **API reference**: [File API — Files](https://developer.seequent.com/docs/api/file/filev2)

This reference covers file addressing, listing, deleting, and versioning. For upload
and download patterns, see the dedicated reference files.

## File addressing

Files can be addressed by **UUID** or by **path**. Both forms work for get, download,
and delete operations.

- **Upload by path** creates folders automatically and creates a new version if the file
  already exists.
- **Update by UUID** requires the file to already exist.

### Path rules

- Paths are **case-insensitive** — uploading to a different case creates a new version,
  not a new file.
- File names (final path segment) are limited to **256 characters**.
- Path segments must not have **leading or trailing whitespace**.
- List and download responses split the address into **`path`** (parent
  directory) and **`name`** (basename). Concatenate `${path}/${name}` for
  the full path.
- **Default to the full path** in summative views (lists, trees, pickers,
  search) — basename alone only in individualised, folder-scoped, or
  deliberately abbreviated contexts. See the **evo-resources** skill.
- Unlike geoscience objects, file paths carry **no `.json` suffix** and
  there is **no body-side `name` field**. See
  [Differences from object paths](#differences-from-object-paths) below.

See the [API reference](https://developer.seequent.com/docs/api/file/filev2) for the
exact endpoint paths and parameter details.

### Differences from object paths

Files and objects both expose `name`/`path` pairs with different semantics:

| Aspect | Files | Geoscience Objects |
|---|---|---|
| Suffix | none | wire path ends in `.json` (strip for display) |
| `name` on list | basename | filename incl. `.json` |
| Single-GET path | `path` + `name` | `object_path` (full, no separate basename) |
| Body `name` field | n/a | `object.name` is body content — title in detail views only, never a path or identity |
| Case sensitivity | case-insensitive | case-sensitive |
| Character set | broad | ASCII `letters + digits + +-.:=_/` |

The "full path in summative views, basename only when context permits"
rule applies to both APIs — see the **evo-resources** skill. For object
path reconstruction details, see the **evo-objects** skill.

## Listing files

> **Guide**: [Listing Files](https://developer.seequent.com/docs/guides/file/listing-files)
> | **Pagination**: See the **evo-pagination** skill for common patterns.

The list endpoint returns the latest version of each file in a workspace. It supports
`limit`/`offset` pagination (max 5000 per request) and filtering by name, author, and
creation time. The response includes a `total` field for building paginated UIs.

See the [API reference](https://developer.seequent.com/docs/api/file/filev2) for
query parameters and response schema.

## Deleting files

> **Guide**: [Deleting a File](https://developer.seequent.com/docs/guides/file/deleting-a-file)

Delete by path or UUID. Returns `204 No Content` on success. Deleting a file removes
the file and **all historic versions**.

Files are **soft-deleted** — pass `?deleted=true` on GET requests to include deleted
files in results.

## Versioning

Files are automatically versioned. Each upload creates a new version with a unique
`version_id`. Key behaviours:

- The latest version is always returned unless a specific `version_id` query parameter
  is provided.
- Pass `?include_versions=true` on GET requests to retrieve the full version history.
- Compare `version_id` values to detect when a new version has finished processing
  after upload.

See the [API reference](https://developer.seequent.com/docs/api/file/filev2) for the
version-related query parameters and the version object schema.

See also the [release notes](https://developer.seequent.com/docs/api/file/release-notes)
for version history and breaking changes (e.g., `version_id` changed from integer to
string).
