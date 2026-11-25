# Security Remediation Tasks

These five tasks cover the findings in `seequent-labs-vibe-aid-appsec-analysis.md` (F-01 to F-08). Each bullet below is taken from that report's remediation text. Items the report gives as examples ("e.g.") are marked as examples, and items it only suggests ("consider", "prefer") are marked optional. Add focused tests for every change, and run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` after each task.

Severity and roadmap phase come from the report: F-01 to F-04 are Medium, F-05 to F-08 are Low, and there are no Critical or High findings.

## 1. Secure authentication state and logout lifecycle

**Addresses:** F-01, F-02 (Medium). Roadmap: F-02 is Immediate; F-01 is Short-Term.

**F-01 — token persistence and expiry**
- Validate persisted auth metadata with a Zod schema on load, replacing `JSON.parse(raw) as AuthState` in `src/store/authSlice.ts`.
- Optional: prefer keeping tokens in memory, or in a dedicated Web Worker / Backend-for-Frontend for production deployments.
- Add a `setTimeout` auto-logout keyed on `expiresAt - Date.now()` in `AuthGuard`, since `expiresAt` is currently checked only once at bundle initialization.
- Trigger logout or re-authentication on HTTP `401 Unauthorized` from Evo API calls (`evoFetch`).
- Decode base64url JWT payloads in `src/api/auth/ims.ts` safely: restore `=` padding and decode bytes as UTF-8 (for example with `TextDecoder`) instead of Latin-1.

**F-02 — OPFS cache on logout**
- Expose an application-level `BlobStore` singleton/provider.
- Call `await blobStore.clearAll()` in `src/pages/Logout.tsx`, and on session expiry, before redirecting to IMS `endSession`.
- Optional: scope OPFS cache keys, or clear `localStorage` `INSTANCE_LOCAL_KEY`, when the signed-in identity (`user.sub`) changes.

**Acceptance criteria:**
- Persisted auth state is schema-validated before use.
- An open SPA logs out at `expiresAt`.
- An Evo `401` triggers logout or re-authentication.
- Non-ASCII names in JWT claims (`given_name` / `family_name`) decode correctly, and unpadded base64url payloads no longer throw.
- Logout and session expiry clear the OPFS Evo cache.

## 2. Lock down Evo resource URLs and bearer-token destinations

**Addresses:** F-03 (Medium). Roadmap: Immediate.

- Rewrite `normaliseHubUrl()` in `src/api/evo/refs/base.ts` with `new URL(value)`: require `protocol === "https:"` and reject non-empty `username`, `password`, `search`, `hash`, or `pathname !== "/"`.
- Verify that `ref.hubUrl` matches one of the user's discovered `EvoInstance.hubUrl` values before attaching `Authorization` headers.
- Encode `versionId` in `EvoBlockModelRef.toUrl()` with `encodeURIComponent(this.versionId)`.
- Reject empty, `.`, and `..` path segments in `encodeResourcePath`, `objectPathSchema`, and `filePathSchema`, and enforce the documented ASCII path charset for `ObjectPath`.
- Add tests for each case above.

**Acceptance criteria:**
- `parseEvoUrl` / `normaliseHubUrl` no longer accept arbitrary `https://` origins, userinfo, paths, queries, or fragments.
- A bearer token is only attached to a `hubUrl` that belongs to a discovered instance.
- Block-model version IDs are encoded like object and file version IDs.
- Path segments `.` and `..` cannot reach a request URL.

## 3. Apply least privilege and add agentic AppSec guardrails

**Addresses:** F-04 (Medium). Roadmap: the scope change is Immediate; guardrails, CSP documentation and lint rules are Template Ecosystem & Agentic Hardening.

**Scopes**
- Change `.env.example` `VITE_IMS_SCOPES` to `"evo.discovery evo.workspace"`.
- Have the AI agent add `evo.object`, `evo.file`, or `evo.blocksync` only when implementing a feature that needs them. Keep `SETUP.md` and the setup skill consistent with this default.

**CSP**
- Document explicit CSP domain-pinning rules in `AGENTS.md` and `.claude/skills/evo-blob-transfers/SKILL.md`.
- Blob storage hosts: the report suggests adding the exact Azure Blob host pattern to `connect-src` (for example `https://*.blob.core.windows.net`) only if pre-signed URLs are not already fronted by `*.seequent.*`. That condition has not been verified, so add a host only after confirming the exact host a real upload or download uses.
- The report also notes CSP friction for map tiles in the README's satellite-imagery example prompt. Any such host would need the same exact-host treatment.
- Do not loosen `connect-src` to `https:` or a wildcard, and do not remove the CSP `<meta>` tag, to silence violations.

**Agent guardrails in `AGENTS.md`** (the report's examples of rules to include)
- Prohibit `dangerouslySetInnerHTML`.
- Prohibit sending `accessToken` to URLs that are not discovered Evo origins.
- Prohibit `https:` or `*` in the CSP.

**Lint**
- Add security rules to `eslint.config.js`, for example `no-danger` (via `eslint-plugin-react`) and bans on `eval` / implied eval.

**Acceptance criteria:**
- A fresh setup requests only discovery and workspace scopes.
- `AGENTS.md` and the blob-transfers skill state the CSP pinning rules and the AppSec guardrails above.
- The lint configuration flags the listed unsafe patterns.

## 4. Harden blob-transfer integrity and HTTPS use

**Addresses:** F-05 (Low). Roadmap: Short-Term.

- Accept `200 OK` for a chunk only when `chunk.from === 0 && chunk.to === totalSize - 1`; require `206 Partial Content` otherwise.
- Throw `BlobTransferError` when `buf.byteLength !== expected`, rather than trimming or accepting short reads.
- Validate `asBlobRef()` against a 64-character hex SHA-256 digest or the UUID form: `/^([0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i`.
- Enforce `https://` on `uploadUrl` / `downloadUrl` in `downloadToStore` and `uploadFromStore`.
- Verify `sha256Hex(bytes) === ref` when `ref` is a 64-character hex digest, including in `readParquetFromCache`.
- Add tests for ignored Range headers, short reads, over-delivery, invalid URLs, invalid refs, and hash mismatches.

**Acceptance criteria:**
- A server or proxy that ignores `Range` and returns `200` for a later chunk is rejected instead of writing misplaced bytes.
- Truncated or over-long chunks are rejected.
- Content-addressed blobs are checked against their SHA-256 ref before use.
- Non-HTTPS transfer URLs are rejected.

## 5. Complete route, headers, documentation, and repository security hardening

**Addresses:** F-06, F-07, F-08 (Low). Roadmap: F-06 is Short-Term; F-07 and F-08 are Template Ecosystem & Agentic Hardening.

**F-06 — routes**
- Stop executing logout from a `GET /logout` route on load. Invoke logout from an authenticated UI action handler (for example `onClick` in `Layout.tsx`), or require a navigation-state confirmation.
- Stop rendering raw `/error?message=` text. Pass transient messages through React Router in-memory `location.state`, or map predefined error codes (for example `?code=oauth_state_mismatch`) to static UI copy.

**F-07 — production headers**
- Provide ready-to-use static-host header configuration (for example `public/_headers` or `staticwebapp.config.json`) that sets as HTTP headers:
  - `Content-Security-Policy`, including `frame-ancestors 'none'`
  - `Strict-Transport-Security`
  - `X-Content-Type-Options: nosniff`
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- Hosting platforms named in the report as examples: Azure Static Web Apps, Netlify, Cloudflare Pages, Vercel. Cover those where practical.
- Reason: `frame-ancestors` is ignored in a `<meta>` CSP, and the other headers cannot be set through `<meta>` at all.

**F-08 — repository governance**
- Add `SECURITY.md` pointing to Bentley/Seequent's coordinated vulnerability disclosure channel.
- Add `.github/workflows/ci.yml` running typecheck, zero-warning lint, unit tests, and `npm audit`, so repositories created through "Use this template" inherit it.
- Add a warning in `.env.example` and `SETUP.md` that all `VITE_*` variables are compiled into public browser JavaScript and must never hold private API secrets. Domain-restricted public map tokens are the only acceptable use.
- Context: the report notes GitHub Issues are disabled (`has_issues: false`), which is why `SECURITY.md` must name a reporting channel.

**Acceptance criteria:**
- Navigating to a URL cannot silently end a session.
- Arbitrary URL text is not displayed as an application error message.
- Deployable header configuration covers the five headers above.
- The repository has a vulnerability reporting path and a CI workflow.
- Environment documentation warns that `VITE_*` values are public.
