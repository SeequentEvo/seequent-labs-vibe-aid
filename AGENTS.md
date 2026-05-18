# Vibe Aid — Agent Instructions

This is the **Seequent Labs Vibe Aid** template — a starting point for building geoscience
web apps that integrate with the **Seequent Evo** data platform.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS 4 · Redux Toolkit · React Router 7

## Project structure

```
src/
├── api/
│   ├── auth/          # OAuth PKCE flow (Bentley IMS)
│   └── evo/           # Evo API clients (discovery, workspaces, ...)
├── components/        # Shared components (Layout, AuthGuard, InstanceGuard, ...)
├── hooks/             # Typed Redux hooks (useAppDispatch, useAppSelector)
├── pages/             # Route-level page components
├── store/             # Redux slices (auth, instance, workspaces, ...)
└── types/             # Shared TypeScript interfaces (Evo API types)
```

## App architecture

- **Auth**: OAuth 2.0 PKCE flow → Bentley Identity (IMS). Tokens stored in Redux + sessionStorage.
  Auth state auto-expires. `AuthGuard` protects all authenticated routes.
- **Discovery**: after login, the app calls the Discovery API to resolve which Evo instances
  (organisations + hub URLs) the user can access. `InstanceGuard` ensures a valid instance is
  selected before rendering child routes.
- **Workspace selection**: once an instance is selected, workspace-scoped routes become available.
  All Evo API calls require `org_id` and `workspace_id` from the selected instance and workspace.
- **Instance persistence**: the selected instance ID is stored in both sessionStorage (current-tab,
  cleared on logout) and localStorage (last-used, retained across logouts). On next login,
  `InstancePicker` reads sessionStorage first, falling back to localStorage, to auto-redirect
  returning users to their previous instance.
- Route structure: `/login` → `/` (instance picker) → `/:instanceId/workspaces` → ...

Auth, discovery, and workspace listing are already wired up. Build from here.

## Making authenticated API calls

All Evo API calls follow the same pattern:

1. Get `accessToken` from the auth store
2. Get `hubUrl` and `id` (org_id) from the selected instance
3. Call `{hubUrl}/{service}/...` with `Authorization: Bearer {accessToken}`

See `src/api/evo/` for existing examples (discovery, workspaces). When adding a new
integration, follow this pattern: add an API client in `src/api/evo/`, types in
`src/types/`, a Redux slice in `src/store/`, and wire it up in a page component.

## Getting started

See the **setup** skill for environment configuration (IMS client ID, `.env`, redirect URIs).

## Evo platform skills

These skills teach you how to integrate with each Evo service. Read the relevant skill
when implementing a feature — they contain API patterns, known pitfalls, and links to the
authoritative API reference at [developer.seequent.com](https://developer.seequent.com).

### Core services

| Skill | Purpose |
|-------|---------|
| **evo-discovery** | Resolve instances, organisations, and hub URLs |
| **evo-workspaces** | List workspaces, manage roles, handle workspace selection |
| **evo-files** | Upload, download, list, and manage files in a workspace |
| **evo-objects** | Geoscience objects — CRUD, Parquet data blobs, schemas, stages |
| **evo-blockmodels** | Block models — geometry, columnar data, async jobs, reporting |
| **evo-colormaps** | Colour mappings for object attributes and visualisation |

### Cross-cutting concerns

| Skill | Purpose |
|-------|---------|
| **evo-scopes** | Which OAuth scopes to request for each API |
| **evo-blob-transfers** | Chunked upload/download via pre-signed Azure Blob URLs |
| **evo-pagination** | Limit/offset patterns for all list endpoints |
| **evo-resources** | Presenting Evo resources to users — editorial guidance on which metadata to surface, translate, or hide (for app users) and typed resource IDs and references with URL round-trip (for developers) |

## Adding a new resource ID type

Every Evo resource identifier in this template is a distinct TypeScript type
with Zod validation at trust boundaries. See the **evo-resources** skill
(`references/resource-ids.md`) for the full recipes and the rationale.

## Conventions

- API reference at developer.seequent.com is the single source of truth for endpoint details
- Never expose UUIDs or raw version IDs to end users
- Skills use a lean index (`SKILL.md`) pointing to `references/` files for domain detail

## No fabricated data

This template integrates with **real Evo data**. Synthetic or placeholder geoscience
payloads in runtime code paths are not acceptable — they look plausible, convey no
real information, and hide integration bugs.

If integration is hard, **diagnose the real obstacle, then ask the user** (missing
scope, unclear contract, wrong workspace ID). Do not route around the API with
invented data, "fallback" / "proxy" paths, or hidden substitutions. If the user sees a
visualisation, they must be able to tell whether it reflects real API data.

The only acceptable placeholders are clearly-labelled UI scaffolding before the data
layer is ready — they MUST be banner-labelled ("Placeholder data — not from Evo"),
confined to a clearly-named module (e.g. `__placeholder/`), tracked as an explicit
TODO, and removed before the integration is claimed complete. Test fixtures
(`*.test.*`, `*.stories.*`, `mocks/`) are unaffected.

## Keep modules small

Files over **~300 lines** warrant a hard look; over **~600 lines** almost always need
decomposition. The `src/` layout already gives the axes — split a feature across
`api/`, `types/`, `store/`, `hooks/`, `components/`, and `pages/` rather than piling
into one file. Prefer libraries over hand-rolled framework-in-a-file equivalents
(custom data grids, router shims, etc.).

When adding to a large file, **extract first, then add** — adding to a monolith makes
it harder to review, harder to test, and harder for the next agent to navigate. Dense
single-responsibility files (generated clients, OpenAPI types) are fine even when long.

## Verification commands

Always use these npm scripts to verify changes. The bare `tsc` / `tsc --noEmit`
invocations **do not work** in this project — see footgun below.

| Command | What it does |
|---------|-------------|
| `npm run typecheck` | `tsc -b` — typechecks all project references (the only command that actually typechecks anything here) |
| `npm run lint` | `eslint . --max-warnings 0` |
| `npm test` | `vitest run` |
| `npm run build` | `tsc -b && vite build` — full pipeline |

**Footgun: `npx tsc --noEmit` typechecks nothing.** The root `tsconfig.json` has
`files: []` and only declares `references` to `tsconfig.app.json` and
`tsconfig.node.json`. Bare `tsc` (without `-b`) ignores referenced projects and
silently reports zero errors. **Always use `tsc -b`** (or one of the npm scripts
above). The same applies to `npx tsc`, `tsc`, etc. — any invocation without `-b`
will mislead you.

Likewise, `vite build` uses esbuild for transpilation, not tsc — a successful
`vite build` says nothing about type correctness. The combined `npm run build`
runs `tsc -b` first for that reason.

## Warnings & deprecations

**Zero tolerance.** New code must produce zero warnings from any tool — TypeScript,
ESLint, Vite build, test runner. Lint runs with `--max-warnings 0`; warn-level rules
from extended presets are promoted to `error` so IDE squiggles match the policy.
"0 errors, N warnings" is not a passing state. Use `npm run typecheck` (not bare
`tsc`) to surface type errors — see "Verification commands" above.

Two scenarios, handled differently:

- **Scenario A — you introduced the warning.** Fix it immediately, no user
  interaction. Run lint/build/test after each meaningful edit so you catch warnings
  while context is fresh.
- **Scenario B — a warning was surfaced you did not introduce** (pre-existing code,
  library upgrade, newly-enabled lint rule). **Always discuss with the user before
  acting.** Present what the warning says, where it is, why it likely fired, and the
  options: **fix** (usually default), **suppress** with
  `// eslint-disable-next-line <rule> -- reason` and a written justification, or
  **defer** (separate change). The user picks. **Suppression is never
  agent-initiated** — never silently fix or suppress.

Deprecations are warnings. `tsc` CLI does not surface `@deprecated` markers — only the
language service does — so the ESLint config relies on `@typescript-eslint/no-deprecated`
(type-aware) to close the gap. Same A/B distinction applies, including for deprecation
output from Vite, vitest, or any other CLI invoked during development.

## Imports

A single `@/` alias maps to `src/`. **Cross-folder imports use the alias**
(`import { parseOrgId } from '@/types/ids'`); **same-folder siblings use relative
paths** (`import { foo } from './foo'`). `../` in import paths is forbidden — an
ESLint rule enforces it. The alias is configured in `tsconfig.app.json`,
`vite.config.ts`, and `vitest.config.ts`.

## Security

The template includes baseline security headers in `index.html`:

- **Content-Security-Policy** — restricts resource origins. `connect-src` allows Evo API
  domains (`*.seequent.com`, `*.seequent.net`, `*.seequentapis.com`). Update this directive
  when adding third-party APIs, external fonts, WASM libraries, or analytics.
- **Referrer-Policy** — `strict-origin-when-cross-origin` prevents access tokens leaking
  via referrer headers.

### Production server headers

These cannot be set via meta tags — configure them on your hosting platform:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevent MIME type sniffing |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Enforce HTTPS |
| `X-Frame-Options` | `DENY` | Clickjacking protection (or use CSP `frame-ancestors` header) |
