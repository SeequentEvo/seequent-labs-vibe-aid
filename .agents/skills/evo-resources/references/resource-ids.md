# Resource IDs

A **resource ID** is an atomic identifier for one piece of state on the Evo
platform — an organisation, a workspace, a file, a geoscience object, a
specific version, a path, and so on. This document describes the pattern
the Vibe Aid template uses to make those identifiers safe to handle in
TypeScript code.

## The pattern

> Treat every distinct kind of identifier as its own type. Validate untrusted
> input once at the boundary; trust it everywhere else.

Two design choices follow from that goal:

1. **Distinct types per identifier kind.** A `FileId` and an `ObjectId` are
   both UUID-shaped strings on the wire, but mixing them up is a bug. The
   type system should reject it. Use a *brand* — a phantom type tag attached
   to the underlying primitive — so `FileId` is structurally a `string` at
   runtime but a distinct, non-assignable type at compile time.

2. **Two flavours of brand:**
   - **UUID-validated brands** — for identifiers the API guarantees as
     UUIDs (organisation, workspace, file, object, etc.). All UUID brands
     are assignable to a base `UUID` type but **not to one another**.
     Validation runs once at the boundary and the value is then trusted.
   - **Opaque-string brands** — for identifiers whose format is not
     guaranteed by the API contract (version IDs, paths, OIDC subject
     claims, hub codes). No UUID check; only a non-empty string check.
     Opaque brands are **not** assignable to `UUID`, so they cannot
     accidentally be used in a UUID-only context.

Both flavours come with paired **parse helpers**:

- `parseX(v)` — throws on invalid input. Use at trust boundaries where
  invalid input means a bug or a contract violation (API responses, schema
  parsing).
- `tryParseX(v)` — returns `null` on invalid input. Use where invalid
  input is expected and should be treated as missing (route params, query
  strings, user input).

## Why this matters

| Without brands | With brands |
|---|---|
| `function open(id: string)` accepts any string, including the wrong kind of ID. | `function open(id: FileId)` rejects everything that isn't a `FileId` at compile time. |
| Untrusted input flows through the program as `string`; validation may be repeated, skipped, or inconsistent. | Validation happens once via `parseX` / `tryParseX`; downstream code just sees the branded type and trusts it. |
| Refactors that swap one ID for another silently compile. | The compiler flags every site that needs updating. |

The pattern costs almost nothing at runtime (brands erase to plain
strings) and pays back continuously in compile-time safety.

## ⚠️ Versions are opaque

> The Evo platform does **not** guarantee that `version_id` values are
> UUIDs. They look UUID-shaped today, but the contract permits the
> format to change without notice.

Treat versions as opaque-string IDs. Never UUID-validate them. Never
attempt to parse meaning out of their format. They are tokens whose only
property is "this string identifies this version of this resource."

## How this template implements it

Source: **`src/types/ids.ts`**.

### Brand machinery

```ts
declare const brand: unique symbol;

// Record-based brands: each brand contributes a key. A type's brand
// record is the union of all keys it carries. Assignability follows
// record-subtype rules: a value satisfies a brand requirement if its
// brand record contains the required keys.
type Brand<T, B extends Record<string, true>> = T & {
  readonly [brand]: B;
};

export type UUID        = Brand<string, { UUID: true }>;
export type OrgId       = Brand<string, { UUID: true; OrgId: true }>;
export type WorkspaceId = Brand<string, { UUID: true; WorkspaceId: true }>;
```

The record-based approach gives the assignability lattice we want:

- `OrgId` has `{ UUID: true; OrgId: true }` → assignable to `UUID`.
- `OrgId` is **not** assignable to `WorkspaceId` (it has no
  `WorkspaceId: true` key).
- `WorkspaceId` is **not** assignable to `OrgId` either.

Opaque brands omit the `UUID: true` key, so they are not assignable to
`UUID` at all:

```ts
export type VersionId = Brand<string, { VersionId: true }>;   // opaque
export type FilePath  = Brand<string, { FilePath: true }>;    // opaque
```

### Inventory

The template currently defines:

| Brand | Flavour | Source field |
|---|---|---|
| `UUID` | base | (any UUID) |
| `OrgId` | UUID | organisation / instance ID |
| `WorkspaceId` | UUID | workspace ID |
| `FileId` | UUID | file resource ID |
| `ObjectId` | UUID | geoscience object ID |
| `BlockModelId` | UUID | block model ID |
| `ColormapId` | UUID | colourmap ID |
| `VersionId` | opaque | resource version (opaque per contract) |
| `ObjectPath` | opaque | slash-delimited geoscience object path |
| `FilePath` | opaque | slash-delimited file path |
| `UserId` | opaque | IMS `sub` claim (opaque per OIDC) |
| `HubCode` | opaque | hub identifier (e.g. `us-aws`) |

### Schemas and parsers

Each brand has a Zod schema and two parse helpers. The schemas reuse two
shared bases:

```ts
const uuidBase   = z.uuid();
const opaqueBase = z.string().min(1);

export const fileIdSchema    = uuidBase.transform((v) => v as FileId);
export const versionIdSchema = opaqueBase.transform((v) => v as VersionId);

export const parseFileId = (v: unknown): FileId => fileIdSchema.parse(v);
export const tryParseFileId = (v: unknown): FileId | null => {
  const r = fileIdSchema.safeParse(v);
  return r.success ? r.data : null;
};
```

Use them at every trust boundary:

```ts
// API response — parse inside the response schema
const fileResponseSchema = z.object({ id: fileIdSchema, name: z.string() });

// Route params — tryParse returns null for invalid input
const fileId = tryParseFileId(params.fileId);
if (fileId === null) return notFound();

// Function signatures — accept the branded type, not a plain string
function makeFileRef(fileId: FileId, /* ... */) { /* ... */ }
```

## Adding a new resource ID

When the platform grows a new resource (or you discover an existing
opaque value that needs a brand), follow these steps. They map directly
onto the patterns above.

### Case 1: UUID-validated ID

For a value the Evo API defines as a UUID.

```ts
// 1. Add the type.
export type NewResourceId = Brand<string, { UUID: true; NewResourceId: true }>;

// 2. Add the Zod schema.
export const newResourceIdSchema = uuidBase.transform((v) => v as NewResourceId);

// 3. Add the parse helpers.
export const parseNewResourceId = (v: unknown): NewResourceId =>
  newResourceIdSchema.parse(v);
export const tryParseNewResourceId = (v: unknown): NewResourceId | null => {
  const r = newResourceIdSchema.safeParse(v);
  return r.success ? r.data : null;
};
```

### Case 2: Opaque-string ID

For a value with no guaranteed format (versions, paths, codes).

```ts
// 1. Add the type — does NOT include `UUID: true`.
export type NewOpaqueId = Brand<string, { NewOpaqueId: true }>;

// 2. Add the Zod schema.
export const newOpaqueIdSchema = opaqueBase.transform((v) => v as NewOpaqueId);

// 3. Add the parse helpers.
export const parseNewOpaqueId = (v: unknown): NewOpaqueId =>
  newOpaqueIdSchema.parse(v);
export const tryParseNewOpaqueId = (v: unknown): NewOpaqueId | null => {
  const r = newOpaqueIdSchema.safeParse(v);
  return r.success ? r.data : null;
};
```

### When in doubt

If the API contract is silent about format, prefer an **opaque-string
ID**. Tightening to UUID validation later is a one-line change; loosening
is a breaking one.
