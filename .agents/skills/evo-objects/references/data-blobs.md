# Data Blobs (Parquet)

> **API reference**: [Data](https://developer.seequent.com/docs/api/geoscience-object/data)
> | **Guide**: [Upload Data](https://developer.seequent.com/docs/guides/objects/upload-data)
> | **Blob storage docs**: [Understanding schemas — blob storage](https://developer.seequent.com/docs/data-structures/geoscience-objects/understanding-schemas/blob-storage)

Geoscience objects reference binary data within the object JSON. The binary data is
stored as **Parquet** files and managed through a separate data endpoint.

## How object JSON references Parquet

Array elements in the object JSON contain a `data` field — either a SHA-256 hash (64
hex chars) or a UUID — that identifies a Parquet blob. A single object typically
references **multiple** Parquet blobs (coordinates, indices, attributes, lookup tables,
etc.).

SHA-256 hashes are preferred because they enable automatic deduplication — identical
data uploaded by different objects shares the same blob. UUIDs are used only when data
is streamed directly to the API and the hash cannot be predetermined.

### Element type shapes

Different element types have different metadata shapes, but all share `data` (the blob
reference) and `length` (number of rows):

**Multi-dimensional numeric arrays** (float-array-*, integer-array-*, index-array-*):
```json
{
  "width": 3,
  "data_type": "float64",
  "length": 50,
  "data": "35b8b8ba...dbca"
}
```
→ Parquet file with `width` columns, `length` rows, values of `data_type`

**Single-column types** (bool-array-1, color-array, date-time-array, string-array):
```json
{
  "data_type": "string",
  "length": 50,
  "data": "abc123...def"
}
```
→ No `width` field — implicitly one column

**Lookup tables** (integer → string mapping for categorical attributes):
```json
{
  "keys_data_type": "int64",
  "values_data_type": "string",
  "length": 10,
  "data": "789abc...xyz"
}
```
→ Two columns (key, value), separate data type fields, no `width` or `data_type`

### Building a generic Parquet reader

A helper that reads arbitrary element data can branch on the metadata shape:
- Has `width`? → expect `width` columns of `data_type`
- Has `keys_data_type` + `values_data_type`? → lookup table (2 columns: key, value)
- Otherwise → single column of `data_type`

## Parquet format requirements

All Parquet blobs **must** be written with these options:
- **Format version**: 2.4
- **Compression**: gzip
- **Encryption**: none
- **Data page size**: 1 MB (default)

### Data types

| Type | Notes |
|------|-------|
| float64 (double) | Floating point values |
| int64 | Integer values; indices are always 0-based |
| UTF-8 strings | String type |
| Timestamps | Microseconds (MICROS), normalized to UTC |
| uint32 | Colours in ABGR32 format (8 bits per channel) |

### Column naming

**When writing** Parquet files, column names should match whatever is documented in the
schema element description (e.g., "Columns: x, y, z" → name the columns `x`, `y`, `z`).

**When reading** Parquet files, do not assume column names — only column order is
guaranteed. It is often best to replace column names with a human-readable equivalent:
- For geometry arrays, use the documented schema names (x, y, z)
- For attribute values, use the attribute's `name` field from the object JSON
- For multi-dimensional attributes, use the attribute name as a column-name prefix
  (e.g., `grade_mean`, `grade_stddev`)

### Column ordering

Column order is defined by the schema and must be respected. When a schema says
"Columns: x, y, z", the first column represents X values, the second Y, the third Z.

**Generalised column-major order** must be used when flattening multidimensional array
data. The first spatial dimension (x for an unrotated grid) is contiguous.

### Nullable data

Measured data and attributes may have null values. Geometry data (vertices, meshes,
indices) should **not** have null values.

## Upload flow

Data blobs **must be uploaded before** the object JSON that references them:

1. **Request upload URLs** — PUT to `.../data` with an array of `{ "name": "<sha256>" }`
   (up to **32** per request). The service returns pre-signed upload URLs for blobs that
   don't already exist.
2. **Upload data** — PUT the Parquet content to each `upload_url`.
3. **Upload the object JSON** — the object body references data by hash in `data` fields.

### Deduplication

When using SHA-256 hashes, the service returns `exists: true` for blobs that already
exist — no upload URL is generated. This is the recommended approach.

### Orphaned blobs

If data blobs are uploaded but the object creation step fails, the blobs become
orphaned. This is by design — it is preferable to having an object reference blobs that
don't exist. The API does not provide a way to look up which objects reference a given
blob.

## Download flow

### Resolving download URLs

The object download response includes `links.data` with entries for each referenced
blob:

```json
{
  "links": {
    "data": [
      {
        "id": "81048210-978e-...",
        "name": "35b8b8ba...dbca",
        "download_url": "https://...signed-url..."
      }
    ]
  }
}
```

- **`name`**: the client-provided reference (SHA-256 hash or UUID) — matches the `data`
  field in the object JSON
- **`id`**: a server-assigned UUID (internal identifier)

Build a URL lookup map using `name` as the primary key, falling back to `id` for legacy
data uploaded before the `name` field was added:

```typescript
const urlsByRef = new Map(
  response.links.data.map(link => [link.name ?? link.id, link.download_url])
);

// Resolve a download URL for any element's data field
const url = urlsByRef.get(element.data);
```

### Selective download

Download only the Parquet blobs you actually need. Read the object JSON first to
understand the structure, identify the components relevant to your use case, then
download just those blobs. For composite objects, this usually means homing in on a
specific component rather than downloading everything.

### Consuming data

Data from different blobs is related by **row index** — row 0 of the coordinates
corresponds to row 0 of each attribute in the same domain (e.g., per-vertex or
per-triangle).

For **categorical attributes**, download both the integer values array and the lookup
table. Use the lookup table to map integer codes to human-readable string labels.

## Transfer mechanics

For the actual binary transfer (upload and download), see the **evo-blob-transfers**
skill. It covers simple uploads for small blobs and chunked uploads (Azure Block Blob)
for large blobs, including parallel transfers, retry, and URL expiry handling.
