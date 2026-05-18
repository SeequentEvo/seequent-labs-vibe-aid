---
name: evo-pagination
description: >
  Common pagination patterns for Evo list endpoints. Use this skill when implementing
  paginated lists of files, geoscience objects, block models, workspaces, or any Evo
  resource. Covers limit/offset patterns, total counts, and UI approaches (infinite
  scroll, paged navigation, load more). Also use when another Evo skill references
  evo-pagination for list endpoint guidance.
---

# Pagination

Evo list endpoints use a consistent `limit`/`offset` pagination model. This skill
covers the common pattern shared across File, Geoscience Object, and other APIs.

## Pattern

```
GET ...?limit=50&offset=0
```

- **`limit`** — max results per page (API-specific maximum, typically 5000)
- **`offset`** — number of items to skip
- **`total`** — the response includes a total count of matching resources

## UI patterns

### Infinite scroll

Increment `offset` by `limit` as the user scrolls. Use `total` to know when all items
have been loaded. Good for file browsers and object lists.

### Paged navigation

Show page numbers derived from `total / limit`. Let the user jump to a specific page
by setting `offset = (page - 1) * limit`. Good for admin views or large datasets.

### Load more

A simpler variant of infinite scroll — show a "Load more" button instead of automatic
loading. Good for mobile or when explicit user control is preferred.

## Tips

- Start with a reasonable default `limit` (e.g., 50) and adjust based on the use case.
- Cache `total` from the first response to avoid redundant recalculation.
- Some APIs support `order_by` or sorting parameters — check each API's reference for
  available sort fields.
- The response typically includes `links.next` and `links.prev` for convenience, but
  constructing the offset yourself is equally valid.
