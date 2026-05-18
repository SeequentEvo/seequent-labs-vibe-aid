---
name: evo-resources
description: >
  How to present Evo resources to users — both application users (UI) and
  developer users (code). Use this skill when displaying files, geoscience
  objects, block models, or any Evo resource metadata; when deciding which
  fields are user-friendly, which need translation, and which are opaque;
  when handling resource identifiers in TypeScript; or when constructing,
  parsing, or copying stable resource URLs. Covers the editorial taxonomy
  of resource metadata, the typed branded ID layer, and the composite
  Reference layer with URL round-trip. Also use when another Evo skill
  references evo-resources for presentation guidance.
---

# Evo resources

This skill governs how Evo resources are *presented to users*. There are
two distinct user personas, each served by different parts of this skill:

- **Application users** — interact with the UI. Need rules about *what*
  to display (names, dates, sizes, paths, people) and *what to hide*
  (UUIDs, version IDs, etags).
- **Developer users** — interact with code. Need typed identifiers,
  composite resource references, and stable URLs that round-trip safely
  between code and the wire.

The summary below covers the application-user side. Developers should
follow the architecture documented in the reference files at the end
of this document.

## For application users

Every metadata field on an Evo resource falls into one of three
editorial stances: **surface** (show as-is), **translate** (convert
machine form to human form before showing), or **hide** (platform
plumbing — never in the UI). The taxonomy:

- **Identity** — `name`, `description`. Surface.
- **Resource type** — translate raw schema strings to friendly labels.
- **Provenance — people** — `created_by`, `updated_by`. Surface the
  display name; hide the user UUID.
- **Provenance — time** — `created_at`, `updated_at`. Translate ISO
  timestamps to human-readable form.
- **Versioning** — hide raw `version_id`; translate to a date-based
  label with a "Latest" marker.
- **State and permissions** — translate enum codes to user language;
  surface only where they affect what the user can do.
- **Categorisation** — `labels`, paths. Surface for discovery and
  navigation.
- **Quantitative** — translate raw units (bytes, counts) into readable
  form; surface where magnitude affects user decisions.
- **Opaque (never display)** — `id` (UUID), `version_id`, `etag`,
  `self_link`, `_links`, internal discriminators. Available in code,
  never in the UI.

For "Copy link" and any feature that exposes a stable handle, use
`ref.toUrl()` — see [resource-references.md](references/resource-references.md).

Layout, components, colours, iconography are app-specific design
choices and out of scope for this skill.

See **[references/resource-metadata.md](references/resource-metadata.md)**
for the rationale behind each stance and guidance on deciding which
fields are important enough to surface.

## For developers

The template uses a two-layer architecture for resource identity in
code: **atomic resource IDs** as branded types, composed into
**resource references** that own URL round-trip. See:

- **[references/resource-ids.md](references/resource-ids.md)** —
  the typed atomic identifier layer: brand pattern, UUID vs opaque
  flavours, parse helpers, the recipe for adding a new ID. Mirrors
  `src/types/ids.ts`.
- **[references/resource-references.md](references/resource-references.md)** —
  the composite reference layer: one class per resource kind,
  `toUrl()` / `fromUrl()` round-trip, `parseEvoUrl` for arbitrary
  inbound URLs, the block-model `version_id` vs `version_uuid` trap.
  Mirrors `src/api/evo/refs/`.

The "Copy link" payload referenced in the application-user rules above
is produced by `ref.toUrl()` — never hand-concatenated.
