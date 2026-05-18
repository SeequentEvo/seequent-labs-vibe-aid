# Querying Block Model Data

Downloading block model data via the query job system.

## Query workflow

> [API reference](https://developer.seequent.com/docs/api/blockmodel/query-block-model-latest-as-post)
> | [Guide](https://developer.seequent.com/docs/guides/blockmodel/general-usage/query-block-model)

Queries are **asynchronous** — same job pattern as updates:

1. **POST** query request → get `job_url`
2. **Poll** `job_url` until `COMPLETE`
3. On complete, response contains `download_url` — download the result file

The `download_url` has a **30-minute TTL** (regenerated on each poll of the completed job).
The download itself can take longer than 30 minutes as long as the connection stays open.

Query results may be **cached** — `job_url` may point to an already-completed job.

## Query parameters

| Field | Description |
|-------|-------------|
| `columns` | Column titles or IDs to include. `["*"]` = all user columns. |
| `geometry_columns` | `"indices"` (default) or `"coordinates"` |
| `bbox` | Optional bounding box filter (IJK or XYZ depending on geometry mode) |
| `output_options` | File format and column header style |
| `version_uuid` | Optional — query a historical version (defaults to latest) |

## Geometry columns in output

| `geometry_columns` value | Regular model output | Sub-blocked model output |
|---|---|---|
| `"indices"` | `i`, `j`, `k` | `i`, `j`, `k`, `sidx` (+ sub-block indices) |
| `"coordinates"` | `x`, `y`, `z` | `x`, `y`, `z`, `dx`, `dy`, `dz` |

## Column selection

- Select by **title** or **column ID** (UUID)
- `["*"]` wildcard expands to all user columns (alphabetical, case-insensitive)
- Wildcard does **not** include `version_id` or `sub_block_derivation` — add explicitly
- Order in the `columns` array determines output order
- Geometry columns are excluded even if specified (they come first automatically)

## Output formats

### Parquet (recommended for web apps)

- Row group size: 100,000
- Compression: Zstd
- Parquet data page version: 1.0
- Parquet version: 2.6

### CSV

- Configurable delimiter via `output_options`
- Column headers match `column_headers` setting (`"name"` or `"id"`)

## Column headers

The `column_headers` field controls output column naming:

| Value | Behaviour |
|-------|-----------|
| `"name"` (default) | Column titles as headers |
| `"id"` | Column UUIDs as headers |

Use `"name"` for human consumption; `"id"` for programmatic round-tripping.

## The `sub_block_derivation` column

For sub-blocked models, this system column indicates where values came from:

| Value | Meaning |
|-------|---------|
| `"user specified"` | Data from uploaded file (or no data available) |
| `"derived from parent"` | Calculated by BMS from parent block values |
| `"some columns derived"` | Mix of uploaded and calculated values |

## Tips for web apps

- For large models, use `bbox` to query only the region the user is viewing
- Select only the columns you need — reduces download size significantly
- Parse Parquet in-browser with libraries like `parquet-wasm` or `hyparquet`
- Cache query results client-side keyed by `version_uuid` + query parameters
- The 30-min download URL TTL should not be an issue if download starts immediately;
  for very large files, see the **evo-blob-transfers** skill for chunked download
