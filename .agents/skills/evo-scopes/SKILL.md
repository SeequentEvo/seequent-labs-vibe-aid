---
name: evo-scopes
description: >
  Understand and configure Evo OAuth scopes for this application. Use this skill when someone
  asks about scopes, what APIs they can access, which scopes to request, how to add or remove
  scopes, or encounters scope-related errors like "invalid scope" during login. Also use when
  the user is adding a new Evo API integration and needs to know which scope it requires.
---

# Evo OAuth Scopes

When registering a new Seequent Evo application at
[developer.bentley.com](https://developer.bentley.com/), a set of OAuth scopes are
pre-configured and cannot be changed on the registration form.

Standard OIDC scopes (`openid`, `profile`, `email`) are **not available** for Evo app
registrations. User identity is obtained by decoding the access token JWT, which contains
claims such as `sub`, `given_name`, `family_name`, and `email`.

## Available scopes

### Required

These scopes should always be included in OAuth requests — they provide access to core Evo
APIs that most apps depend on.

| Scope | API | Description |
|-------|-----|-------------|
| `evo.discovery` | Discovery API | List and resolve Evo instances and hubs. |
| `evo.workspace` | [Workspaces API](https://developer.seequent.com/docs/workspaces) | Access workspaces, folders, and items within a hub. |

### Optional

Include these when your app needs the corresponding API.

| Scope | API | Description |
|-------|-----|-------------|
| `evo.object` | [Geoscience Object API](https://developer.seequent.com/docs/geoscience-objects) | Read and write geoscience objects such as meshes, pointsets, downhole data, and block models. |
| `evo.file` | [File API](https://developer.seequent.com/docs/file) | Upload and download files stored in Evo. |
| `evo.blocksync` | [Block Model API](https://developer.seequent.com/docs/blockmodel) | Synchronise block model data with Evo. |

## Requesting scopes

Scopes are sent as a parameter on the OAuth authorization request — the `scope` field in the
redirect to Bentley IMS. In this template, the scopes are configured via the
`VITE_IMS_SCOPES` environment variable, and the resulting access token is limited to only
the APIs those scopes grant access to.

### Principle of least privilege

Only request the scopes your app actually needs. Requesting unnecessary scopes:

- **Broadens the attack surface** — a compromised token grants access to more APIs than
  the app uses.
- **Erodes user trust** — the consent screen lists every scope, and users may hesitate to
  approve access they don't understand.
- **Complicates auditing** — when every app requests all scopes, it becomes harder to trace
  which app accessed which API.

Start with the minimum (`evo.discovery evo.workspace`) and add scopes incrementally as you
build features that require them. If a feature is removed, remove its scope too.

### Examples

**Minimum for any Evo app:**
```
evo.discovery evo.workspace
```

**Example for an app that reads geoscience objects and files:**
```
evo.discovery evo.workspace evo.object evo.file
```

## Further reading

- [Apps and Tokens](https://developer.seequent.com/docs/guides/getting-started/apps-and-tokens) — registering apps and understanding OAuth scopes
- [Quick Start Guide](https://developer.seequent.com/docs/guides/getting-started/quick-start-guide) — end-to-end getting started guide
- [API Reference](https://developer.seequent.com/docs/api/fundamentals/overview) — Evo REST API fundamentals
- [Evo Developer Community](https://community.seequent.com/group/19-evo) — support and collaboration
