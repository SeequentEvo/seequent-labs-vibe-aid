---
name: evo-objects
description: >
  Understand and use the Evo Geoscience Object API to list, create, download, update, and
  delete geoscience objects, manage object versions, upload and download binary data blobs,
  and work with object schemas. Use this skill when someone asks about geoscience objects,
  meshes, pointsets, drillholes, block models, grids, object data, object schemas, uploading
  or downloading objects, object versioning, object stages, or binary data associated with
  objects. Also use when the user needs to integrate geoscience data into their app.
---

# Evo Geoscience Objects

The Geoscience Object API enables apps to read and write structured geoscience data —
meshes, point clouds, drillhole campaigns, block models, geological model surfaces, and
more — within an Evo workspace.

A **Geoscience Object** (GO) is a JSON document conforming to an open schema from the
[evo-schemas](https://github.com/seequentevo/evo-schemas) repository. Each object has
two parts:

1. **Object JSON** — schema-validated metadata and structural fields (name, bounding box,
   coordinate reference system, and references to binary data).
2. **Data blobs** — binary data (stored as Parquet) referenced by SHA-256 digest within
   the object JSON and uploaded/downloaded separately.

GOs are transactional — they are not dynamically linked to their source and are not a
replacement for a software project. They are used to move, access, and store subsurface
information.

Gzip compression is expected for all object uploads and downloads
(`Content-Encoding: gzip` / `Accept-Encoding: gzip`).

For instance discovery and hub URL resolution, see the **evo-discovery** skill.
For OAuth scopes, see the **evo-scopes** skill.
For workspace selection (required before using objects), see the **evo-workspaces** skill.

## API base URL

All Geoscience Object API requests use the **hub URL** resolved through the Discovery
API (see **evo-discovery** skill):

```
{hub_url}/geoscience-object/orgs/{org_id}/workspaces/{workspace_id}/...
```

Some endpoints operate at the organisation level (no workspace):

```
{hub_url}/geoscience-object/orgs/{org_id}/...
```

Requires the `evo.object` scope. Prefer workspace-level endpoints unless the use case
explicitly requires all-of-org data.

## Reference files

Read the relevant reference file for domain-specific patterns and guidance:

- 📄 **[references/object-management.md](references/object-management.md)** — CRUD
  operations, addressing (UUID vs path), path constraints, move/rename, versioning
- 📄 **[references/data-blobs.md](references/data-blobs.md)** — Parquet data blobs,
  SHA-256 deduplication, upload-before-object flow, orphaned blob risk
- 📄 **[references/schemas.md](references/schemas.md)** — schema hierarchy
  (objects/components/elements), versioning, choosing the right schema
- 📄 **[references/stages.md](references/stages.md)** — lifecycle stages, listing,
  applying to specific versions
- 📄 **[references/openapi.yaml](references/openapi.yaml)** — OpenAPI spec for validating
  endpoints, parameters, and schemas (re-fetch periodically)

## Related skills

- **evo-blob-transfers** — chunked upload/download mechanics (Azure Block Blob, Range
  requests, parallelism). The data-blobs reference above covers the Object API workflow;
  use evo-blob-transfers for the underlying binary transfer patterns.
- **evo-resources** — common rules for presenting metadata to end users (UUID
  handling, version labels, date formatting).
- **evo-pagination** — common `limit`/`offset` pagination patterns for list endpoints.
- **evo-colormaps** — associating colour mappings with object attributes.

## Known discrepancies

Object responses split path identity across multiple fields. Read
`references/object-management.md` for the full picture; in brief:

- The **canonical wire path** addresses an object (always ends in `.json`).
- The **list endpoint** splits it into `path` (parent) + `name` (filename,
  includes `.json`) — concatenate to recover. **Single GET / POST** returns
  the full path as `object_path`.
- Default display in summative views (lists, trees, pickers, search) is
  the **full canonical path with `.json` stripped** — not the basename.
- The body field **`object.name`** is *body content* (schema-defined, e.g.
  `"Example pointset."`), **not** the resource's identity. Surface it as
  a title in detail views only; never use it for paths or requests.

Object path identifiers must be ASCII: letters, numbers, and `+-.:=_/`.

There is no rename endpoint — moving or renaming requires uploading a
new version with the same UUID to a different path.

## API reference (single source of truth)

Always retrieve endpoint signatures, request/response schemas, and parameter details
from the API reference. This skill documents patterns and known pitfalls, but the API
reference is authoritative for exact API behaviour.

- [Geoscience Object API Overview](https://developer.seequent.com/docs/api/geoscience-object/geoscience-object-api)
- [Objects](https://developer.seequent.com/docs/api/geoscience-object/objects) — list, create, download, update, delete, restore, versioning
- [Data](https://developer.seequent.com/docs/api/geoscience-object/data) — binary data upload and download
- [Stages](https://developer.seequent.com/docs/api/geoscience-object/stages) — lifecycle stage management
- [Metadata](https://developer.seequent.com/docs/api/geoscience-object/metadata) — update object version metadata
- [Release Notes](https://developer.seequent.com/docs/api/geoscience-object/release-notes)
- [Guides](https://developer.seequent.com/docs/guides/objects) — conceptual walkthroughs
- [Data Structures](https://developer.seequent.com/docs/data-structures/geoscience-objects) — schema hierarchy and conventions
- [Schema Catalogue](https://developer.seequent.com/docs/data-structures/geoscience-objects/schemas/objects) — all supported object types
- [evo-schemas (GitHub)](https://github.com/seequentevo/evo-schemas) — open-source schema definitions
- [OpenAPI spec (YAML)](https://developer.seequent.com/api-schemas/geoscience-object-v1.yaml)

### Local OpenAPI spec

A copy of the OpenAPI spec is stored at [`references/openapi.yaml`](references/openapi.yaml)
for quick reference when validating endpoints, parameters, and schemas.

**This file should be re-fetched periodically** to ensure it reflects the latest API version.
To refresh, overwrite it from the canonical URL:

```
curl -o references/openapi.yaml https://developer.seequent.com/api-schemas/geoscience-object-v1.yaml
```
