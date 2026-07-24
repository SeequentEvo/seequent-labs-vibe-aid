# Block Model Data Updates

Uploading data to block models — the async workflow, column operations, input formats,
and partial update semantics.

## The async update workflow

> [API reference](https://developer.seequent.com/docs/api/blockmodel/update-block-model-from-latest-version)
> | [Guide](https://developer.seequent.com/docs/guides/blockmodel/general-usage/update-block-model)

Every update creates a **new version**. The workflow is:

1. **PATCH** update request → get `job_url` + `upload_url` (if data upload needed)
2. **PUT** data file to `upload_url` (pre-signed Azure Blob URL)
3. **POST** to notify upload complete
4. **Poll** `job_url` until `COMPLETE` or `FAILED`

Job statuses: `PENDING_UPLOAD` → `QUEUED` → `PROCESSING` → `COMPLETE` / `FAILED`

For large file uploads to `upload_url`, see the **evo-blob-transfers** skill for chunked
upload patterns (Azure Block Blob protocol).

## Column operations

The `columns` field in the update request supports five operations:

| Operation | Description | Requires file upload |
|-----------|-------------|---------------------|
| `new` | Add columns with `title`, `data_type`, optional `unit_id` | Yes |
| `update` | Replace data in existing columns | Yes |
| `rename` | Rename existing columns | No |
| `delete` | Remove columns entirely | No |
| `update_metadata` | Change column title or unit without touching data | No |

Multiple operations can be combined in a single request. Operations that don't require a
file upload skip the upload/notify steps — the job proceeds directly.

## Update type (merge vs replace)

| Value | Behaviour for blocks absent from uploaded file |
|-------|------------------------------------------------|
| `merge` (default) | Retain previous values from the prior version |
| `replace` | Set values to null for blocks not in the file |

Use `merge` when updating a sub-region. Use `replace` for full re-estimation.

## Input formats

Specify `file_format` in `input_options`:

| Format | Notes |
|--------|-------|
| `parquet` (default) | Preferred. Typed columns, no parsing ambiguity. |
| `csv` | Additional options: `delimiter`, `decimal_char`, `quote_char`, `skip_rows` |
| `datamine` | Legacy Datamine format support |

### Column name mapping

If file column names don't match the block model column titles, provide a
`column_name_mapping` object to map file headers → BMS column titles.

## Data types

> [DataType schema](https://developer.seequent.com/docs/api/blockmodel/schemas/datatype)

| Type | Description |
|------|-------------|
| `Float32`, `Float64` | Floating-point numbers |
| `Int8`–`Int64` | Signed integers |
| `UInt8`–`UInt64` | Unsigned integers |
| `Utf8` | Text/string values |
| `Boolean` | True/false |

## System columns (reserved)

These columns are managed by BMS and **cannot** be targeted by update operations:

- Geometry: `i`, `j`, `k`, `x`, `y`, `z`, `dx`, `dy`, `dz`
- Metadata: `version_id`
- Sub-blocking: `sidx`, `start_si`, `start_sj`, `start_sk`, `end_si`, `end_sj`, `end_sk`

## Geometry columns in uploaded files

When uploading data, the file must contain geometry columns so BMS knows which blocks
to assign values to:

- **Indices mode**: include `i`, `j`, `k` (and sub-block indices for sub-blocked models)
- **Coordinates mode**: include `x`, `y`, `z` (and `dx`, `dy`, `dz` for sub-blocked)

The mode is determined by which columns are present in the uploaded file.

## Tips for web apps

- Show a progress indicator during the poll loop — updates can take seconds to minutes
  depending on model size
- Handle `FAILED` gracefully — the response includes error details
- For large files, use chunked upload via the **evo-blob-transfers** skill
- Consider debouncing rapid updates — each creates a new version
