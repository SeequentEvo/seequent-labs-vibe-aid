# Workspace Selection Patterns

Workspace selection follows similar patterns to instance selection (see the **evo-discovery**
skill's [evo-instances.md](../../evo-discovery/references/evo-instances.md) reference), but
with key differences in lifecycle and scope.

## Selection flow

After instance selection, the typical flow is:

1. Fetch workspaces for the selected instance (summary endpoint for selectors).
2. If the user has a persisted workspace preference, validate it against the list.
3. If valid, restore the selection. If invalid (deleted, access removed), clear and prompt.
4. If no preference, show a workspace picker.

## Persistence

Workspace selection is less stringent than instance selection. The preferred approach is
encoding resource identifiers (instance ID, workspace ID) directly in the page URI:

```
/instance/{instanceId}/workspace/{workspaceId}/...
```

### Why URI-based persistence

- **Deep linking** — users can share or bookmark links to specific resources within a
  workspace. A URL like `/instance/abc/workspace/def/objects/xyz` takes someone directly to
  the right context.
- **Multi-tab friendly** — each tab carries its own context in the URL, with no storage
  synchronisation needed.
- **Browser navigation** — back/forward naturally traverses workspace contexts.
- **No stale state** — there's nothing persisted that can silently become invalid.

### When to fall back to storage

URI-based persistence is ideal for apps with clear page structure. If your app has a
single-page layout where the workspace is ambient context (not tied to a specific route),
you can persist the workspace in sessionStorage keyed by instance:

```typescript
const storageKey = `evo_workspace_${instanceId}`;
sessionStorage.setItem(storageKey, workspaceId);
```

This is a simpler alternative when deep linking isn't a goal.

## Validation

Always validate the persisted workspace ID against the current workspace list:

```typescript
function validateWorkspace(
  workspaces: WorkspaceSummary[],
  persistedId: string | null
): string | null {
  if (!persistedId) return null;
  const found = workspaces.find(ws => ws.id === persistedId);
  return found ? persistedId : null;
}
```

Reasons a persisted workspace may become invalid:
- Workspace was deleted.
- User's role was removed.
- Instance was switched (different instance, different workspaces).

## When to skip workspace selection

Some apps don't need workspace selection at all:

- **Workspace management apps** — the app _is_ the workspace selector (e.g., a workspace
  admin dashboard).
- **Org-level workflows** — cross-workspace search, resource aggregation, or APIs that
  support instance-scoped operations.
- **Single-workspace apps** — if the app is known to operate on exactly one workspace
  (e.g., provisioned via config), skip the picker and use the configured ID directly.

For apps that work across multiple workspaces, consider a workspace context that allows
multi-select or shows data grouped by workspace.

## Showing user role

The workspace list includes `current_user_role` for each workspace. Use this to:

- **Set expectations** — grey out or annotate workspaces where the user is a viewer if the
  app requires write access.
- **Filter options** — for apps that require editor/owner access, filter the workspace list
  to only show workspaces the user can edit.
- **Show in workspace header** — optionally display the role badge in the app header so
  the user knows their permissions at a glance.

## Workspace selector UX

A workspace selector should show:
- **Workspace name** (primary text)
- **User's role** (secondary text or badge — viewer/editor/owner)
- **Last updated** or **created by** (optional, helps distinguish workspaces)
- **Thumbnail** (optional, if workspaces have thumbnails uploaded)

For large numbers of workspaces, support:
- **Search/filter** by name
- **Sorting** (recently updated, alphabetical, by role)
- **Pagination** or virtual scrolling

## Instance switching invalidates workspace

When the user switches instances, any workspace context is no longer valid. With URI-based
persistence this happens naturally — navigating to a new instance route clears the workspace
from the URL. If using storage-based persistence, clear the sessionStorage key for the old
instance.

The localStorage preference for the old instance can be preserved — if the user switches
back later, their workspace preference is still there.

## TypeScript types

```typescript
interface WorkspaceSummary {
  id: string;
  name: string;
}

interface Workspace extends WorkspaceSummary {
  description: string;
  current_user_role: 'owner' | 'editor' | 'viewer';
  created_at: string;
  created_by: { id: string; name: string; email: string };
  updated_at: string;
  updated_by: { id: string; name: string; email: string };
  bounding_box: GeoJSON.Polygon | null;
  default_coordinate_system: string;
  labels: string[];
  ml_enabled: boolean;
  self_link: string;
}
```
