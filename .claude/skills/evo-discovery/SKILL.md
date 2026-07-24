---
name: evo-discovery
description: >
  Understand and use the Evo Discovery API to resolve instances and API base URLs. Use this
  skill when someone asks about Evo instances, organisations, hubs, how to find their Evo
  data, how to connect to Evo APIs, or needs to implement discovery in the app. Also use
  when the user asks about Evo structure, hierarchy, or nomenclature.
---

# Evo Discovery

The Discovery API is the global entrypoint to the
[Seequent Evo](https://www.seequent.com/products-solutions/seequent-evo/) data platform.
It resolves which Evo instances a user has access to and the API base URL for each instance.

For OAuth setup and scopes, see the **evo-scopes** and **setup** skills.

## Global entrypoint

The Discovery API is globally routed — this base URL is always known and does not vary by
region:

```
https://discover.api.seequent.com
```

All other Evo API base URLs (hub URLs) are region-dependent and **must** be resolved
through this endpoint at runtime.

## Evo hierarchy

```
Instance → Workspace → Data
```

- **Instance** — top-level container for data and users. Provisioned by Seequent sales.
  Currently called "organisation" in the API — being renamed to "instance".
- **Workspace** — organises data within an instance. Users can be Owner, Editor, or Viewer.
  See the [Workspaces guide](https://developer.seequent.com/docs/guides/workspaces).
- **Hub** — regional deployment of Evo cloud infrastructure. Each instance resides on one
  hub. Hubs are an implementation detail — users interact with instances and workspaces.

## Discovery request

Requires the `evo.discovery` scope.

```
GET https://discover.api.seequent.com/evo/identity/v2/discovery?service=evo
Authorization: Bearer <access_token>
```

The `service=evo` parameter is a catch-all that returns all available services. You can
also request specific service codes: `blockmodel`, `file`, `geoscienceobject` — pass
multiple as `?service=file&service=blockmodel`.

### Response structure

The JSON response contains four sections:

| Section | Purpose |
|---------|---------|
| `organizations` | Instances the user belongs to. Each has an `id` and `display_name`. |
| `hubs` | Hub regions. Each has a `code`, `display_name`, and `url` (the API base URL). |
| `services` | Available Evo services. |
| `service_access` | Maps each instance (`org_id`) to a `hub_code` and available `services`. |

### Resolving the API base URL

1. Find the user's instance in `organizations` — note the `id`.
2. Find the matching entry in `service_access` — note the `hub_code`.
3. Look up the `hub_code` in `hubs` — the `url` is the API base URL.

For the full API specification, see
[references/discovery-api.yaml](references/discovery-api.yaml). For instance selection,
persistence, and switching patterns, see
[references/evo-instances.md](references/evo-instances.md). For standardised data models
(`EvoInstance`, `EvoUser`, `AppContext`), see
[references/data-models.md](references/data-models.md). The official API reference
is published at
[developer.seequent.com](https://developer.seequent.com/docs/api/workspaces/discovery#v2-discovery)
(bundled with the Workspaces API docs).

## Next steps after discovery

Once you have resolved an instance and its hub URL, the next step is typically workspace
selection. See the **evo-workspaces** skill for workspace listing, selection, roles, and
permissions.

## Further reading

- [Evo Discovery Guide](https://developer.seequent.com/docs/guides/getting-started/discovery) — full walkthrough with example request/response
- [Evo Developer Portal](https://developer.seequent.com/) — guides, API reference, and SDK docs
