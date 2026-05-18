# Block Model Management

CRUD operations, naming, listing, and lifecycle management for block models.

## Addressing

Block models are identified by their **UUID** (`bm_id`). Unlike geoscience objects, there is
no path-based addressing — names must be **unique within a workspace**.

> **Identifier names differ between path and body.** OpenAPI path parameters are spelled
> `bm_id` (e.g. `/block-models/{bm_id}`), but block-model **response bodies expose the
> same UUID under the field name `bm_uuid`**. Application code must read `bm_uuid` from
> responses and pass it as `bm_id` when constructing URLs. Related identifiers:
> `version_uuid` (BMS version), `geoscience_object_id` / `block_model_uuid` (the GO ↔ BMS
> bridge fields — see "Reference objects" below).

## Creating a block model

> [API reference](https://developer.seequent.com/docs/api/blockmodel/create-block-model)
> | [Guide](https://developer.seequent.com/docs/guides/blockmodel/general-usage/create-block-model)

Creation is **asynchronous** — the POST returns a `job_url` to poll.

Geometry is defined at creation and is **immutable**:
- `model_origin` — XYZ offset
- `block_rotation` — up to 3 clockwise axis rotations (can be empty `[]`)
- `size_options` — model type + dimensions (structure varies by type)

| Model type | `size_options` fields |
|---|---|
| `regular` | `block_size` (x,y,z) + `n_blocks` (nx,ny,nz) |
| `variable-octree` | `block_size` + `n_blocks` + octree depth |
| `fully-sub-blocked` | `block_size` + `n_blocks` + sub-block counts |
| `flexible` | `block_size` + `n_blocks` + sub-block ranges |

Optional fields: `coordinate_reference_system` (e.g. `EPSG:27200`), `size_unit_id` (e.g. `m`)
— the unit is required if you plan to use reporting.

## Listing block models

> [API reference](https://developer.seequent.com/docs/api/blockmodel/list-block-models)
> | [Guide](https://developer.seequent.com/docs/guides/blockmodel/general-usage/block-model-metadata/list-block-models)

Available at workspace level and organisation level (cross-workspace).

Pagination: `limit` (1–100, default 50), `offset`. See the **evo-pagination** skill.

Sorting: `order_by` supports `name`, `created_at`, `modified_at`. Prefix with `desc:` for
descending order.

Filtering: `deleted=true` lists only soft-deleted models.

## Getting a block model

> [API reference](https://developer.seequent.com/docs/api/blockmodel/retrieve-block-model)

```
GET .../block-models/{bm_id}
```

Use `?deleted=true` to retrieve a soft-deleted model.

## Deleting and restoring

> [API reference: Delete](https://developer.seequent.com/docs/api/blockmodel/delete-block-model)
> | [Restore](https://developer.seequent.com/docs/api/blockmodel/restore-block-model)
> | [Guide](https://developer.seequent.com/docs/guides/blockmodel/general-usage/block-model-metadata/delete-and-restore-block-model)

- **DELETE** → `204 No Content`. Soft-deletes; child resources return `410 Gone`.
- **Restore**: `POST .../block-models/{bm_id}?deleted=false` → `202 Accepted`.
- Name conflicts on restore are resolved with a numeric suffix (e.g. `"Model (1)"`).

## Reference objects (Geoscience Object bridge)

> [Guide](https://developer.seequent.com/docs/guides/blockmodel/general-usage/reference-objects)

When a block model is created, a matching **reference object** is auto-created in the
Geoscience Object Service (type `block-model`). This keeps block models discoverable via
the GO listing APIs.

Linkage:
- Block model response → `geoscience_object_id`
- Geoscience object response → `block_model_uuid`
- Version-level: `geoscience_version_id` ↔ `version_uuid`

Auto-sync: metadata updates, new versions, and deletion/restoration all propagate to the
reference object automatically. You should **not** modify the reference object directly.

## Metadata presentation

For displaying block model metadata to end users (names, dates, version labels), see the
**evo-resources** skill.

Key points:
- Never show UUIDs (`bm_id`, `version_uuid`) to users
- Use date-based version labels + "Latest" tag (same pattern as files and objects)
- `version_uuid` is an opaque string — do not make assumptions about its format
