# Resource references

A **resource reference** is a typed in-memory handle to a specific Evo
resource — the object form of a resource URL. References are how
application code passes resource identity around: as parameters to
functions, in Redux state, between components, into SDK calls. URLs
appear only at the boundaries (an outgoing API call, a "Copy link"
payload, an incoming deep link); inside the program everything is a
reference.

This document describes the pattern, then shows how the Vibe Aid
template realises it in `src/api/evo/refs/`.

## The pattern

> One reference class per resource kind. The reference owns the URL —
> URLs are produced by `toUrl()` and parsed by `fromUrl()`.

Five design choices follow:

1. **One class per resource kind.** Each kind gets a distinct class
   (`EvoFileRef`, `EvoObjectRef`, etc.). The class encodes exactly the
   minimal set of typed atomic IDs required to identify the resource —
   for example, an object reference carries `(orgId, workspaceId,
   objectId | objectPath, versionId?)`. The atomic IDs are the brands
   from the [resource IDs](./resource-ids.md) layer.

2. **Discriminated union over `kind`.** Every reference exposes a
   `readonly kind: '<resource>'` literal. Application code that handles
   "any reference" narrows on `kind` instead of `instanceof` checks,
   and the union is exhaustive.

3. **URL is a method, not a separate concept.** Each reference exposes
   `toUrl(): string` (serialise) and `static fromUrl(url): RefClass`
   (parse one specific kind). A top-level `parseEvoUrl(url)` dispatches
   to the right class by service segment and returns the discriminated
   union. The URL is the *wire format* of the reference; there is no
   "URL module" separate from references.

4. **Static factories, not raw constructors.** Each reference exposes
   `fromIds(...)`, `fromUrl(...)`, and where appropriate `fromPath(...)`
   and `fromWorkspace(parentRef, ...)`. The constructor is private. Each
   factory parses its inputs (via the atomic ID parsers) so a
   constructed reference is always valid.

5. **Immutable transformations.** Mutating a reference returns a new
   instance: `withVersion(v)`, `withoutVersion()`. References are
   value-like — `equals()` is structural; `toString()` returns the URL.

## Why this matters

| Without references | With references |
|---|---|
| Functions take `(orgId, workspaceId, fileId, versionId?)` — every signature repeats the parameter set. | Functions take `(ref: EvoFileRef)`. |
| URL strings are concatenated by hand in many places, with subtle drift between them. | URLs are produced by one method per kind; the canonical form is enforced. |
| Parsing a "Copy link" URL means a custom regex per call site. | `parseEvoUrl(url)` returns the right reference; the rest of the code is type-driven. |
| `withVersion` is open-coded inconsistently. | A method on the reference; immutable update is one line. |

## ⚠️ Block-model `version_id` vs `version_uuid`

Block model versions are the one place where the URL path variable is
**misleadingly named**. A block-model URL uses
`/versions/{version_id}` but expects the **UUID**, not the integer
`version_id` field that block-model responses also expose. Pass the
response field `version_uuid` when constructing the URL.

The block-model reference's `withVersion(versionId: string)` accepts
the UUID form (which the template treats as an opaque
[`VersionId`](./resource-ids.md#-versions-are-opaque) — like every other
version identifier in Evo).

## How this template implements it

Source: **`src/api/evo/refs/`**.

### Class hierarchy

```
EvoResourceRef          (abstract; owns hubUrl, orgId, kind, toUrl, equals)
└─ WorkspaceScopedRef   (abstract; adds workspaceId, toWorkspaceRef())
   ├─ EvoWorkspaceRef     kind: 'workspace'
   ├─ EvoFileRef          kind: 'file'
   ├─ EvoObjectRef        kind: 'object'
   ├─ EvoBlockModelRef    kind: 'block-model'
   └─ EvoColormapRef      kind: 'colormap'
```

The base class normalises `hubUrl` (`https://` only, trailing slash
stripped) and parses `orgId` via `parseOrgId`. The
`WorkspaceScopedRef` layer parses `workspaceId` via `parseWorkspaceId`
and adds `toWorkspaceRef()` for "give me the parent workspace
reference of this resource."

### Factories

Every concrete class follows the same factory convention:

```ts
EvoFileRef.fromIds({ hubUrl, orgId, workspaceId, fileId, versionId? });
EvoFileRef.fromPath({ hubUrl, orgId, workspaceId, filePath, versionId? });
EvoFileRef.fromWorkspace(workspaceRef, { fileId | filePath, versionId? });
EvoFileRef.fromUrl(url);
```

`fromWorkspace` is the most ergonomic in practice: once you have an
`EvoWorkspaceRef`, building child references no longer requires
repeating `hubUrl`, `orgId`, `workspaceId`.

### URL round-trip

Each reference exposes `toUrl()`. A small selection of patterns:

```ts
// EvoWorkspaceRef
`${hubUrl}/workspace/orgs/${orgId}/workspaces/${workspaceId}`

// EvoFileRef (UUID form, optionally versioned)
`${hubUrl}/file/v2/orgs/${orgId}/workspaces/${workspaceId}/files/${fileId}`
+ (versionId ? `?version_id=${encodeURIComponent(versionId)}` : '')

// EvoObjectRef (UUID form, optionally versioned — note `?version=` not `?version_id=`)
`${hubUrl}/geoscience-object/orgs/${orgId}/workspaces/${workspaceId}/objects/${objectId}`
+ (versionId ? `?version=${encodeURIComponent(versionId)}` : '')

// EvoBlockModelRef (versioned variant uses a path segment, not a query string)
`${hubUrl}/blockmodel/orgs/${orgId}/workspaces/${workspaceId}/block-models/${bmId}`
+ (versionId ? `/versions/${versionId}` : '')

// EvoColormapRef (no versioning)
`${hubUrl}/colormap/orgs/${orgId}/workspaces/${workspaceId}/colormaps/${colormapId}`
```

Path-based variants (files and objects only) replace the trailing
`{id}` with `path/{encoded path}`. The path is encoded with
`encodeResourcePath` — encode each segment, preserve `/` separators.

### Parsing arbitrary URLs

When a URL arrives from outside (deep link, copied link, API response),
use `parseEvoUrl`:

```ts
import { parseEvoUrl, tryParseEvoUrl } from '@/api/evo/refs';

const ref = parseEvoUrl(url);   // throws on malformed/unrecognised
switch (ref.kind) {
  case 'file':        /* ref is EvoFileRef */        break;
  case 'object':      /* ref is EvoObjectRef */      break;
  case 'block-model': /* ref is EvoBlockModelRef */  break;
  case 'colormap':    /* ref is EvoColormapRef */    break;
  case 'workspace':   /* ref is EvoWorkspaceRef */   break;
}
```

`parseEvoUrl` dispatches by the first path segment (`file`,
`geoscience-object`, `blockmodel`, `colormap`, `workspace`) and
delegates to the appropriate `RefClass.fromUrl()`. Use `tryParseEvoUrl`
when invalid input should be tolerated (e.g. user-pasted text).

### Helpers

The base module exposes three small helpers, used by every concrete
class:

| Helper | Purpose |
|---|---|
| `normaliseHubUrl(url)` | Enforce `https://`; strip trailing slash. |
| `encodeResourcePath(path)` | Encode each `/`-separated segment; preserve separators. |
| `decodeResourcePath(encoded)` | Decode a percent-encoded path once; do not re-split. |

### Producing "Copy link" payloads

The Copy link UI action (see [SKILL.md](../SKILL.md)) copies the URL
form of the relevant reference. Always go through `ref.toUrl()` rather
than concatenating strings — that's the whole point of the reference
layer.

```ts
await navigator.clipboard.writeText(fileRef.toUrl());
```

## Summary

References are the in-code form; URLs are the wire form; `toUrl()` and
`fromUrl()` are the bridge. Application code should rarely touch URL
strings directly — it should compose, narrow, and pass references, and
let the reference produce its URL only at the boundary.
