# Colourmap Associations

Linking colourmaps to geoscience object attributes.

## What is an association?

An association binds a **colourmap** to a specific **attribute** on a **geoscience object**.
Once associated, any application rendering that attribute can look up the colourmap and use
consistent colours.

## The `attribute_id` field

The association's `attribute_id` maps to the `key` field of a geoscience object attribute.
For details on geoscience object attributes, see the **evo-objects** skill.

## Creating an association

> [API reference](https://developer.seequent.com/docs/api/colormap/colormap-api)

```
POST .../objects/{object_id}/associations
Content-Type: application/json

{
  "attribute_id": "<attribute key>",
  "colormap_id": "<colourmap UUID>"
}
```

Where `object_id` is the geoscience object UUID.

## Batch associations

Create up to **128 associations** in a single call:

```
POST .../objects/{object_id}/associations/batch
Content-Type: application/json

{
  "associations": [
    { "attribute_id": "<key-1>", "colormap_id": "<colourmap-uuid-1>" },
    { "attribute_id": "<key-2>", "colormap_id": "<colourmap-uuid-2>" }
  ]
}
```

Prefer batch for any workflow that associates multiple attributes at once.

## Listing associations

```
GET .../objects/{object_id}/associations
```

Returns all associations for the given object.

## Block models

Block models do not have their own colourmap endpoints. Instead, associate colourmaps with
the block model's **reference object** — the auto-created geoscience object of type
`block-model` (see the **evo-blockmodels** skill for reference object details).

Use the block model's `geoscience_object_id` as the `object_id` in the association endpoint.

## Files

The File API stores unstructured data — files have no attributes and therefore no colourmap
support.

## Write-once behaviour

v1.0 of the Colormap API has **no DELETE or UPDATE** endpoints. Colormaps and associations
are immutable once created.

If you need to change the colours for an attribute:
1. Create a new colourmap with the updated colours
2. Create a new association linking the attribute to the new colourmap
3. When listing associations, the most recently created one takes precedence (by convention)

## Tips for web apps

- **Load associations lazily** — only fetch when rendering a specific object
- **Cache colourmap definitions** — they never change (write-once), so cache aggressively
- **Fall back gracefully** — not all attributes will have associations; provide sensible
  defaults for unassociated attributes
- **Workspace metadata endpoint** — `GET .../metadata` returns a map of object metadata
  for the workspace, which may be useful for pre-fetching colourmap context
- When presenting a colour picker, show the `[R, G, B]` as a preview swatch in the UI
