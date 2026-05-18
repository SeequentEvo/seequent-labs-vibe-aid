---
name: evo-workspaces
description: >
  Understand and use the Evo Workspaces API to list, create, update, and delete workspaces,
  manage user roles and permissions, and handle workspace selection in the app. Use this skill
  when someone asks about workspaces, workspace permissions, user roles (owner/editor/viewer),
  workspace thumbnails, listing or filtering workspaces, or admin workspace operations. Also
  use when the user needs to decide whether their app requires workspace selection or can
  operate at the instance level.
---

# Evo Workspaces

Workspaces organise data within an Evo instance. Most Evo API operations are scoped to a
workspace, making workspace selection a prerequisite for nearly all app workflows.

For instance discovery and hub URL resolution, see the **evo-discovery** skill.
For OAuth scopes, see the **evo-scopes** skill.

## When workspaces are (and aren't) required

Most apps require the user to select a workspace before interacting with data. However,
some workflows operate at the **instance level**:

- **Workspace CRUD** — creating, listing, updating, and deleting workspaces is inherently
  an instance-level operation.
- **Instance-level resource listing** — some APIs support listing resources across all workspaces
  in an instance.
- **Cross-workspace apps** — some apps intentionally interact with data from multiple
  workspaces, but always within the same instance.

If your app works with data from a specific workspace, require workspace selection. If it
aggregates or manages resources across workspaces, workspace selection may be optional or
take a different form (e.g., multi-select).

## API base URL

All workspace API requests use the **hub URL** resolved through the Discovery API (see
**evo-discovery** skill), with paths scoped to an instance:

```
{hub_url}/workspace/orgs/{org_id}/workspaces
```

Requires the `evo.workspace` scope.

## Listing workspaces

> **API reference**: [Workspace Endpoints](https://developer.seequent.com/docs/api/workspaces/workspaces)

```
GET {hub_url}/workspace/orgs/{org_id}/workspaces
Authorization: Bearer <access_token>
```

Returns a paginated list of workspaces the user has a role in. The response includes
pagination links and an array of workspace objects.

### Query parameters

| Parameter | Description |
|-----------|-------------|
| `limit` | Number of results per page. |
| `offset` | Position to start listing from. |
| `order_by` | Sort order — see [sorting](#sorting). |
| `user_id` | Filter by user ID with access (`eq` operator). |
| `created_by` | Filter by creator user ID (`eq` operator). |
| `created_at` | Filter by creation time (`eq`, `lt`, `lte`, `gt`, `gte`). |
| `updated_at` | Filter by last updated time (`eq`, `lt`, `lte`, `gt`, `gte`). |
| `name` | Filter by workspace name (`eq` operator). |
| `deleted` | Include soft-deleted workspaces (`true`/`false`). |

Filter syntax uses `operator:value` — e.g., `?created_at=gt:2024-01-01T00:00:00Z`.

### Sorting

Use the `order_by` parameter. Prefix with `desc:` for descending order.

| Value | Description |
|-------|-------------|
| `name` | Alphabetical by name |
| `created_at` | By creation time |
| `updated_at` | By last modified time |
| `user_role` | By user's role in the workspace |

### Workspace summary

For lightweight listing (just ID and name), use the summary endpoint:

```
GET {hub_url}/workspace/orgs/{org_id}/workspaces/summary
```

This is useful for workspace selectors where you don't need full workspace metadata.

### Workspace object

A full workspace object includes:

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Workspace identifier. |
| `name` | string | Display name (1–60 chars). |
| `description` | string | Optional description. |
| `current_user_role` | string | The requesting user's role: `owner`, `editor`, or `viewer`. |
| `created_at` | datetime | Creation timestamp. |
| `created_by` | object | Creator `{ id, name, email }`. |
| `updated_at` | datetime | Last modified timestamp. |
| `updated_by` | object | Last modifier `{ id, name, email }`. |
| `bounding_box` | GeoJSON | Optional spatial extent (Polygon). |
| `default_coordinate_system` | string | Optional CRS (e.g., `EPSG:7642`). |
| `labels` | string[] | Optional tags. |
| `ml_enabled` | boolean | Whether ML features are enabled. |
| `self_link` | URI | Canonical URL for this workspace. |

## Workspace CRUD

> **API reference**: [Workspace Endpoints](https://developer.seequent.com/docs/api/workspaces/workspaces)

### Create

```
POST {hub_url}/workspace/orgs/{org_id}/workspaces
Content-Type: application/json

{
  "name": "My workspace",
  "description": "Optional description",
  "default_coordinate_system": "EPSG:7642",
  "bounding_box": { ... }
}
```

Returns `201` with the created workspace object. The creator is automatically assigned the
`owner` role.

### Read

```
GET {hub_url}/workspace/orgs/{org_id}/workspaces/{workspace_id}
```

Returns the workspace object if the user has a role in it.

### Update

```
PATCH {hub_url}/workspace/orgs/{org_id}/workspaces/{workspace_id}
Content-Type: application/json

{
  "name": "Updated name",
  "description": "Updated description"
}
```

Requires `owner` or `editor` role. Only include fields you want to change.

### Delete

```
DELETE {hub_url}/workspace/orgs/{org_id}/workspaces/{workspace_id}
```

Requires `owner` role. Soft-deletes the workspace — it can be restored later.

### Restore

```
POST {hub_url}/workspace/orgs/{org_id}/workspaces/{workspace_id}?deleted=false
```

Requires `owner` role. If there's a naming conflict, a numeric suffix is appended
(e.g., `My workspace (2)`).

## User roles and permissions

> **API reference**: [Workspace Endpoints — user roles](https://developer.seequent.com/docs/api/workspaces/workspaces)

Three roles control access within a workspace:

| Role | Read | Create/Edit | Delete workspace |
|------|------|-------------|------------------|
| **Viewer** | ✅ | ❌ | ❌ |
| **Editor** | ✅ | ✅ | ❌ |
| **Owner** | ✅ | ✅ | ✅ |

Users can modify roles up to and including their own level — an editor can assign
viewer or editor roles but cannot assign or remove owner.

### List user roles

```
GET {hub_url}/workspace/orgs/{org_id}/workspaces/{workspace_id}/users
```

Returns all users with a role in the workspace, including `user_id`, `full_name`, `email`,
and `role`.

### Get current user's role

```
GET {hub_url}/workspace/orgs/{org_id}/workspaces/{workspace_id}/current-user-role
```

Returns `{ role, user_id }`. Useful for checking permissions before showing UI actions.

### Assign a role

```
POST {hub_url}/workspace/orgs/{org_id}/workspaces/{workspace_id}/users
Content-Type: application/json

{ "role": "editor", "user_id": "<user-uuid>" }
```

### Remove a user

```
DELETE {hub_url}/workspace/orgs/{org_id}/workspaces/{workspace_id}/users/{user_id}
```

## Admin endpoints

> **API reference**: [Admin Endpoints](https://developer.seequent.com/docs/api/workspaces/admin)
> | **Guide**: [Admin Functionality](https://developer.seequent.com/docs/guides/workspaces/admins)

Evo admins (users with an administrator role in the instance) have elevated access
through separate `/admin` endpoints:

```
{hub_url}/workspace/admin/orgs/{org_id}/workspaces/
```

Admin endpoints allow:
- Listing **all** workspaces in the instance, regardless of role membership.
- Managing user roles in any workspace.
- Accessing thumbnails for any workspace.

Regular workspace endpoints only return workspaces the user has a role in.

## Thumbnails

> **API reference**: [Thumbnail Endpoints](https://developer.seequent.com/docs/api/workspaces/thumbnails)

Workspaces support thumbnail images (PNG, JPEG, HEIC) for visual identification in
workspace selectors.

- **Upload**: `POST {hub_url}/workspace/orgs/{org_id}/workspaces/{workspace_id}/thumbnail`
- **Download**: `GET {hub_url}/workspace/orgs/{org_id}/workspaces/{workspace_id}/thumbnail`
- **Delete**: `DELETE {hub_url}/workspace/orgs/{org_id}/workspaces/{workspace_id}/thumbnail`

## UX patterns for workspace selection

For detailed workspace selection patterns (persistence, multi-tab behaviour, etc.), see
[references/workspace-selection.md](references/workspace-selection.md).

Key principles:
- Most apps should present a workspace selector after instance selection.
- The summary endpoint is ideal for populating selectors (lightweight, just ID + name).
- Prefer encoding workspace (and instance) IDs in the page URI — this enables deep
  linking and natural multi-tab behaviour.
- Show the user's role in the workspace to set expectations about what they can do.
- Consider showing `updated_at` or `created_by` to help users identify the right workspace.

## Further reading

### Guides

- [Workspaces Overview](https://developer.seequent.com/docs/guides/workspaces) — concepts
  and capabilities
- [Manage Workspaces](https://developer.seequent.com/docs/guides/workspaces/manage-workspaces) — CRUD walkthrough with examples
- [User Roles](https://developer.seequent.com/docs/guides/workspaces/user-roles) — role
  management guide
- [Admin Functionality](https://developer.seequent.com/docs/guides/workspaces/admins) — admin endpoints and bulk operations
- [FAQ](https://developer.seequent.com/docs/guides/workspaces/faq) — common questions

### API reference (single source of truth)

Always refer to the API reference for the most up-to-date endpoint signatures, request/response
schemas, and parameter details. The skill documents patterns and usage guidance, but the API
reference is authoritative for exact API behaviour.

- [Workspaces API Overview](https://developer.seequent.com/docs/api/workspaces/workspaces-api) — API summary and links to all endpoint groups
- [Workspace Endpoints](https://developer.seequent.com/docs/api/workspaces/workspaces) — list, create, read, update, delete, restore, summary, user roles
- [Thumbnail Endpoints](https://developer.seequent.com/docs/api/workspaces/thumbnails) — upload, download, delete
- [Admin Endpoints](https://developer.seequent.com/docs/api/workspaces/admin) — admin-scoped workspace and user role management
- [Release Notes](https://developer.seequent.com/docs/api/workspaces/release-notes) — version history and breaking changes

> The Workspaces API docs also include discovery endpoints — for discovery, refer to the
> **evo-discovery** skill instead, which maintains a dedicated reference spec.
