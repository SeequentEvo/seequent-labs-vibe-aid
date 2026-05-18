# Resource metadata (for application users)

This reference is the authoritative voice on **what kinds of metadata
Evo resources expose, and what to do with each kind from a user
perspective**. It is editorial, not visual: it tells you which fields
to surface, which to translate from machine form to human form, and
which to withhold from the UI entirely.

It does **not** prescribe layout, components, colours, iconography, or
any other visual design choice. Those are app-specific. The line this
reference draws is: *what does this field mean to a user, and what
should the app do with it?* — not *what does it look like?*.

## The editorial principle

Every field on an Evo resource falls into one of three stances:

- **Surface** — the field is meaningful to the user as-is. Show it.
- **Translate** — the field is meaningful but its raw form is
  machine-shaped. Convert it to a human form before showing it.
- **Hide** — the field is platform-internal and has no user meaning.
  It must not appear in the UI, even though code may use it.

The taxonomy below classifies every metadata kind on Evo resources by
this stance, with the rationale for each.

## Identity

The fields that say "this is what the resource is".

- **`name`** — the central piece of identity. **Surface**, always.
  When `name` is missing or empty, fall back to a generic label that
  names the resource kind ("Untitled file") — never expose the
  underlying ID.
- **`description`** — long-form context the resource's owner provided.
  **Surface** when present. When absent, do not invent a placeholder —
  treat the field as optional.

### Where `name` lives — and the trap with geoscience objects

For most resources, `name` is one field on the response. Geoscience
objects need explicit care because they have a *separate* body property
called `name` that is **not** the resource's identity.

- The **resource's identity** is its **full path** — for files,
  `${path}/${name}`; for objects, the canonical wire path (list:
  `path + name`; single GET: `object_path`) with `.json` stripped for
  display. An object at `geology/surfaces/topo.json` displays as
  `geology/surfaces/topo`.
- The body field **`object.name`** (e.g. `"Topography surface"`) is
  **body content** — sibling to `description`, `bounding_box`, `tags`,
  defined by the geoscience-object schema. It may be surfaced in
  individual-object detail views as a human-readable title, but never
  in summative views, breadcrumbs, "Copy link", or anywhere identity
  is required.

### Path vs basename — context decides

This rule applies to **both** files and objects.

- **Summative views** (lists, trees, pickers, search) — default to the
  **full path** so same-named resources in different folders can be
  told apart. For objects, strip the trailing `.json`.
- **Individualised views** (detail page, side panel, modal, breadcrumb
  tail) — the basename alone is fine; the surrounding chrome conveys
  location. For objects, `object.name` may *additionally* appear here.
- **Folder-scoped views** — the basename is fine; folder context is
  implicit in the view.
- **Author-chosen abbreviations** — a developer may consciously drop
  the path in a dense or constrained context. Document the decision;
  do not default to it.

When in doubt, prefer the full path.

## Resource type

What kind of thing the resource is (file, geoscience object, block
model, colormap, …).

- **Translate.** Surface a friendly type label ("geoscience object",
  "block model"), never the raw API string (e.g.
  `pointset-1.0.0`, `regular-3d-grid`). Schema names and version
  suffixes are implementation detail.
- For object schemas, the *category* (mesh, pointset, drillhole, …) is
  user-meaningful; the *schema version* is not.

## Provenance — people

Who created the resource, who last modified it.

- **`created_by`**, **`updated_by`** — **surface** the person's
  display name. The user's email is a fallback when name is missing.
- The user's `id` (UUID) is **hide** — never display it.
- These fields support trust ("I recognise this person") and
  discoverability ("show me what my team has been working on"). Their
  importance grows with detail-level views; they may be omitted in
  very dense list views where space is the constraint.

## Provenance — time

When the resource was created or last modified.

- **`created_at`**, **`updated_at`** — **translate** from ISO
  timestamps into human-readable form. The app decides the exact
  presentation (relative for recent activity, absolute for older
  entries, locale-aware) — but the raw ISO string should never reach
  the user.
- Both are important: `created_at` answers "how long has this
  existed?", `updated_at` answers "is this fresh?".

## Versioning

Which version of a resource the user is looking at.

- The underlying **`version_id`** is opaque (see
  [resource-ids.md](resource-ids.md) — versions are not UUIDs and
  their format is not contracted). It is **hide**.
- **Translate** versioning into a label the user can reason about —
  typically the version's timestamp ("Apr 12, 2025") combined with a
  marker for the head version ("Latest"). Sequential numbering
  ("v1", "v2") is unreliable because intermediate versions can be
  deleted — dates do not have this problem.
- For features that need a stable shareable handle to a specific
  version (e.g. "Copy link"), use `ref.toUrl()` — see
  [resource-references.md](resource-references.md). The URL itself is
  appropriate to share; the bare `version_id` inside it is not
  appropriate to display.

## State and permissions

What the user can do with the resource right now.

- **`current_user_role`** (and similar permission/state enums) —
  **translate** the enum value into a friendly label or affordance.
  The raw string ("editor") is acceptable when it's already a real
  word; codes like `WRITE_ACL` or `2` must be mapped to user language.
- Surface only when it changes what the user can do or how they should
  read the resource. Permission state on a list row is useful;
  permission state on a deeply nested detail panel may be noise.

## Categorisation

How resources are grouped, filtered, or located.

- **`labels`** (and tags) — **surface**. They are user-authored,
  user-meaningful, and useful for discovery and filtering.
- **Paths** (e.g. `ObjectPath`, `FilePath`) — **surface** as a
  navigable location. The shape of paths is owned by
  [resource-references.md](resource-references.md); see the **Identity**
  section above for path-vs-basename display rules and the
  geoscience-object trap with `object.name`.
- **Geoscience object paths require a `.json` suffix on the wire** —
  the server enforces it, but it is a transport detail. **Translate**
  by stripping the suffix before display (and re-applying when
  constructing requests).
- **List vs single-GET for objects:** the list response splits the
  canonical path into `path` (parent) + `name` (filename, includes
  `.json`); the single-GET response returns it whole as `object_path`.
  Reconstruct the canonical path (list: `path + name`; single:
  `object_path`) before addressing it — a list `path` of `"/"` is not
  addressable alone.
- **The File API has no `.json` suffix or body-side name field.** Do
  not copy object-side handling across to files, or vice versa.

## Quantitative

Sizes, counts, extents — anything numeric that describes the
resource's magnitude.

- **Translate** raw machine units (bytes, point counts, cell counts)
  into readable form (KB / MB / GB; locale-formatted large numbers).
- **Surface** when the magnitude affects user decisions: file size
  before download, point count before opening a viewer, block count
  before running a long operation. **Omit** when the magnitude is
  irrelevant to the user's task at hand.

## Opaque (never display)

Platform-internal identifiers and links that have no user meaning.
These are **hide** — available in code, never in the UI.

- **`id` (UUID)** — the resource's primary key. Show the resource
  name instead.
- **`version_id`** — opaque versioning token. Show a date-based label
  instead (see Versioning above).
- **`etag`** — cache validation token; meaningful only to HTTP.
- **`self_link`**, **`_links`** — discovery hyperlinks; meaningful
  only to API clients.
- **`kind`** discriminator on Reference objects — internal to code.
- Any field whose name suggests platform plumbing (cache tokens,
  cursors, internal flags, schema URIs) — when in doubt, hide.

For features that need to expose a stable handle (Copy link, share
URL, deep-link), use `ref.toUrl()` from
[resource-references.md](resource-references.md). The URL is
appropriate to share because it round-trips through the API; the bare
identifiers inside it are not appropriate to read.

## Deciding what's "important"

The metadata that conveys **identity, provenance, and state** is what
a user needs to answer two questions:

1. **"Is this the right resource?"** — answered by identity (name,
   type, description) and provenance (who, when).
2. **"What can I do with it?"** — answered by state and permissions,
   versioning, and quantitative metadata where it gates action.

Categorisation supports discovery before either question is asked.
Opaque fields support neither question and stay hidden.

When in doubt about whether to surface a field: ask which of those two
questions it helps the user answer. If neither, it's probably opaque.
