# Security Remediation Tasks

These five tasks cover the findings in `seequent-labs-vibe-aid-appsec-analysis.md`. Work in priority order, add focused tests for every change, and run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` after each task.

## 1. Secure authentication state and logout lifecycle (urgent)

**Addresses:** F-01, F-02

- Replace unchecked `sessionStorage` deserialization in `src/store/authSlice.ts` with a Zod schema.
- Make browser-storage access safe when `sessionStorage` is unavailable or blocked, including in tests and privacy-restricted environments.
- Add runtime expiry enforcement in `AuthGuard` and clear authenticated state when the token expires.
- Add logout/re-authentication behavior for Evo API `401 Unauthorized` responses.
- Implement UTF-8-safe JWT base64url decoding in `src/api/auth/ims.ts`.
- Expose a BlobStore singleton/provider for application use.
- In `src/pages/Logout.tsx`, clear the complete OPFS cache with `await blobStore.clearAll()` before IMS logout.
- Apply the same cache/session cleanup on token expiry and identity changes.
- Consider clearing instance-related persisted state when the signed-in `user.sub` changes.

**Acceptance criteria:**
- Invalid or expired persisted auth state can never enter Redux.
- An open SPA automatically logs out at `expiresAt`.
- Evo `401` responses do not leave the app in an apparently authenticated state.
- JWT names containing non-ASCII characters decode correctly.
- Logout and session expiry remove all cached Evo blobs and persisted auth state.

## 2. Lock down Evo resource URLs and bearer-token destinations (urgent)

**Addresses:** F-03

- Rewrite `normaliseHubUrl()` using `new URL()`.
- Require HTTPS, reject credentials, query strings, fragments, and non-root URL paths.
- Pin every bearer-enabled request to a discovered Evo instance's `hubUrl`; never send `Authorization` from parsed deep links or pasted URLs to an untrusted origin.
- Validate parsed Evo URLs and resource identifiers at the boundary.
- Encode `EvoBlockModelRef` version IDs with `encodeURIComponent()`.
- Reject empty, `.`, `..`, and unsafe path segments in `encodeResourcePath()`, `objectPathSchema`, and `filePathSchema`.
- Add tests for userinfo, arbitrary origins, query/fragment URLs, dot-segment traversal, and block-model version escaping.

**Acceptance criteria:**
- `evoFetch`, resource fetches, and workspace operations only attach bearer tokens to discovered Evo origins.
- Malformed or cross-origin resource URLs are rejected before network access.
- Resource paths cannot escape or normalize across endpoint boundaries.
- Block-model URLs round-trip version IDs safely.

## 3. Apply least privilege and prevent insecure AppSec drift (high)

**Addresses:** F-04

- Change `.env.example` defaults to `evo.discovery evo.workspace` and document adding feature-specific Evo scopes only when required.
- Review setup documentation and skills so default setup no longer requests `evo.object`, `evo.file`, or `evo.blocksync` unless a feature needs them.
- Add the exact allowed Azure Blob/third-party origins needed for real workflows to `connect-src`; do not allow `https:` or broad wildcard-origin relaxations.
- Add explicit AppSec instructions to `AGENTS.md`, including prohibitions on:
  - `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `eval`, and implied eval;
  - sending bearer tokens to undiscovered origins;
  - broad CSP wildcards or removing CSP without a documented justification;
  - committing private values to `VITE_*` variables.
- Add or strengthen ESLint rules for unsafe HTML and dynamic code execution where supported.
- Add focused tests or static checks for scope defaults and disallowed security patterns.

**Acceptance criteria:**
- A fresh setup requests only discovery and workspace scopes.
- CSP changes require explicit allowlisting rather than broad `https:` access.
- Agent instructions contain enforceable credential, URL, HTML, and CSP rules.
- Vibe-coded additions cannot trivially introduce `dangerouslySetInnerHTML`, eval, or bearer exfiltration patterns.

## 4. Harden blob-transfer integrity and HTTPS use (high)

**Addresses:** F-05

- Enforce HTTPS for all upload and download pre-signed URLs.
- Require `206 Partial Content` for chunked range requests.
- Allow `200 OK` only for a complete one-chunk download covering the entire blob.
- Reject short, over-delivered, or otherwise mismatched chunk lengths instead of trimming or padding silently.
- Validate BlobRefs: permit only 64-character hex SHA-256 digests or the documented UUID form.
- Verify `sha256Hex(bytes) === ref` for SHA-256 BlobRefs before cache use or Parquet decoding.
- Add tests for ignored Range headers, short reads, over-delivery, invalid URLs, invalid refs, and hash mismatches.

**Acceptance criteria:**
- No corrupted or truncated chunk is written to persistent storage.
- Cached and decoded content is proven to match a content-addressed BlobRef.
- Blob transfer functions reject non-HTTPS URLs.
- Transfer failures clean up partial cache entries.

## 5. Complete route, headers, documentation, and repository security hardening (medium)

**Addresses:** F-06, F-07, F-08

- Replace automatic `/logout` route execution with an authenticated UI action or confirmation flow.
- Replace `/error?message=` reflection with predefined error codes or in-memory React Router state.
- Add production HTTP header configurations for CSP with `frame-ancestors 'none'`, HSTS, `X-Content-Type-Options: nosniff`, `Cross-Origin-Opener-Policy`, and `Permissions-Policy`.
- Provide examples for supported static hosting platforms where practical.
- Add `SECURITY.md` with a clear coordinated vulnerability disclosure route.
- Add `.github/workflows/ci.yml` to run typecheck, lint, tests, build, and dependency audit.
- Update `.env.example` and setup docs with a clear warning that all `VITE_*` values are public browser JavaScript and must never contain private secrets.
- Review whether GitHub Issues should be enabled or whether an alternate reporting channel should be clearly documented.

**Acceptance criteria:**
- Top-level navigation cannot silently terminate a session.
- Arbitrary URL text is not displayed as an application error.
- Production deployments have deployable anti-framing, transport, and MIME-sniffing protections.
- The repository provides a vulnerability report path and inherited CI coverage.
- Environment documentation prevents private API credentials from being marked as `VITE_*`.
