---
name: evo-colormaps
description: >
  Understand and use the Evo Colormap API to create colourmaps and associate them with
  geoscience object attributes. Use this skill when someone asks about colourmaps, colour
  scales, colour mapping, visualisation of attributes, associating colours with data,
  continuous gradients, discrete ranges, or category colour schemes. Also use when the user
  needs to apply consistent colouring across objects in a workspace.
---

# Evo Colourmaps

The Colormap API provides workspace-scoped colour mappings that can be associated with
geoscience object attributes. By binding an attribute to a named colourmap, every application
rendering that attribute uses the same colours — ensuring a consistent visual language across
teams and tools.

For instance discovery and hub URL resolution, see the **evo-discovery** skill.
For workspace context, see the **evo-workspaces** skill.

## API base URL

No dedicated OAuth scope — access is controlled by workspace membership role.

```
{hub_url}/colormap/orgs/{org_id}/workspaces/{workspace_id}/colormaps
```

> **Note:** The API uses American English spelling (`colormap`) in all URLs and field names.
> This skill uses British English (`colourmap`) in prose to match Seequent convention.

## Key concepts

| Concept | Summary |
|---------|---------|
| **Three types** | `continuous` (gradient), `discrete` (range buckets), `category` (string→colour) |
| **Colour format** | `[R, G, B]` integer triplets, each 0–255 |
| **Write-once** | v1.0 has no DELETE or UPDATE endpoints — colourmaps and associations are immutable once created |
| **Associations** | Link a colourmap to a specific attribute on a geoscience object via `attribute_id` |
| **attribute_id** | Maps to the `key` field of a geoscience object attribute (stable through renames) |
| **Block models** | Associate via the block model's auto-created reference object (see **evo-blockmodels** skill) |

## Reference files

| File | When to read |
|------|--------------|
| [`references/colourmap-types.md`](references/colourmap-types.md) | Creating colourmaps — continuous, discrete, and category types with examples |
| [`references/associations.md`](references/associations.md) | Linking colourmaps to object attributes, batch association, block model handling |

## Related skills

- **evo-objects** — geoscience object attributes (the `key` field that `attribute_id` maps to)
- **evo-blockmodels** — block model reference objects (how to associate colourmaps with BM columns)
- **evo-resources** — presenting colourmap metadata (names, dates, people) to users, and constructing stable resource URLs
- **evo-workspaces** — workspace scoping and roles

## Known limitations

- **No DELETE or UPDATE** in v1.0 — to change a colourmap, create a new one and re-associate
- **No pagination documented** — list endpoint returns all colormaps in the workspace
- **Files have no colourmap support** — colourmaps only apply to structured attribute data

## API reference (single source of truth)

- [Colormap API Overview](https://developer.seequent.com/docs/api/colormap/colormap-api)
- [Colormap Guide](https://developer.seequent.com/docs/guides/colormap)
