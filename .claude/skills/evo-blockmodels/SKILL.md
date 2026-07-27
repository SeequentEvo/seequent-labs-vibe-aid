---
name: evo-blockmodels
description: >
  Understand and use the Evo Block Model API to create, update, query, delete, and report on
  block models in Evo workspaces. Use this skill when someone asks about block models, block
  model data, uploading or downloading block model data, block model versioning, sub-blocking,
  block model columns, reporting on block models, or integrating with the BlockSync API. Also
  use when the user needs to understand block model geometry, model types, or data formats
  (Parquet, CSV, Datamine).
---

# Evo Block Models

The Block Model API (BlockSync) is a **dedicated service** for managing three-dimensional
block models within Evo workspaces. Unlike the Geoscience Object API (which stores JSON metadata
+ separate blobs), BMS manages geometry, columnar data, versioning, and reporting server-side.

Block models are a core geoscience data structure — they divide a volume of earth into a regular
or sub-blocked grid of cells, each carrying attribute columns (grade, lithology, density, etc.)
used in resource estimation and mine planning.

For instance discovery and hub URL resolution, see the **evo-discovery** skill.
For OAuth scopes, see the **evo-scopes** skill.

> **Source of truth.** When the bundled docs in this skill conflict with
> [`references/openapi.yaml`](references/openapi.yaml) or
> [developer.seequent.com](https://developer.seequent.com/docs/api/blockmodel/block-model-api),
> trust the live API reference. Re-fetch `references/openapi.yaml` if you suspect drift
> (see "Local OpenAPI spec" below).

## API base URL

Required scope: `evo.blocksync`

```
{hub_url}/blockmodel/orgs/{org_id}/workspaces/{workspace_id}/block-models
```

Organisation-level listing: `{hub_url}/blockmodel/orgs/{org_id}/block-models`

## Key concepts

| Concept | Summary |
|---------|---------|
| **Model types** | `regular`, `variable-octree`, `fully-sub-blocked`, `flexible` — geometry fixed at creation |
| **Async jobs** | All writes and queries return a `job_url` to poll (QUEUED → PROCESSING → COMPLETE/FAILED) |
| **Column-oriented** | Server-managed typed columns; partial updates supported (specific columns, merge/replace) |
| **Reference objects** | Auto-created Geoscience Object (type `block-model`) keeps BMS models visible in GO listings |
| **Versioning** | Each create/update produces a new version with `version_uuid`; any version queryable |
| **Reporting** | Built-in report specs, jobs, and version-to-version comparisons |

## Reference files

Read these for domain-specific guidance:

| File | When to read |
|------|--------------|
| [`references/block-model-management.md`](references/block-model-management.md) | Creating, listing, getting, deleting, restoring block models; naming rules; reference objects |
| [`references/data-updates.md`](references/data-updates.md) | Uploading data, column operations, partial updates, input formats, the async update workflow |
| [`references/querying.md`](references/querying.md) | Downloading block model data — query jobs, column selection, geometry modes, output formats |
| [`references/reporting.md`](references/reporting.md) | Report specifications, reporting jobs, version comparisons, autorun |
| [`references/openapi.yaml`](references/openapi.yaml) | Validating endpoint paths, HTTP methods, parameters, request/response schemas (re-fetch periodically) |

## Related skills

- **evo-blob-transfers** — pre-signed URL upload mechanics (chunked upload for large files)
- **evo-pagination** — limit/offset patterns for list endpoints (max 100 per page for BMS)
- **evo-resources** — presenting metadata (names, dates, people) to users, and constructing stable resource URLs
- **evo-objects** — Geoscience Object API (the reference object counterpart)
- **evo-colormaps** — associating colour mappings with block model attributes (via reference object)

## Known discrepancies

- BMS pagination max is 100 per page (vs 5000 for Geoscience Objects)
- BMS names must be unique within a workspace (no path-based addressing like GO)
- BMS version IDs are `version_uuid` (opaque string) — do not expose to users

## API reference (single source of truth)

- [Block Model API Overview](https://developer.seequent.com/docs/api/blockmodel/block-model-api)
- [Guides index](https://developer.seequent.com/docs/guides/blockmodel)
- [OpenAPI spec (YAML)](https://developer.seequent.com/api-schemas/blockmodel-v1.yaml)

### Local OpenAPI spec

A copy of the OpenAPI spec is stored at [`references/openapi.yaml`](references/openapi.yaml)
for quick reference when validating endpoints, parameters, and schemas.

**This file should be re-fetched periodically** to ensure it reflects the latest API version.
To refresh, overwrite it from the canonical URL:

```
curl -o references/openapi.yaml https://developer.seequent.com/api-schemas/blockmodel-v1.yaml
```
