# Evo Instances

An Evo **instance** is the top-level container for a user's data and team. Users may belong
to multiple instances, but an app should only ever interact with **one instance at a time**.
The app must let the user choose which instance to work with, and all app state should
reflect the currently selected instance.

> The API currently calls these "organisations" (`organizations` field in the discovery
> response). This is being renamed to "instances" — use "instance" in user-facing UI.

## Discovering instances

Call the Discovery API after login to find the user's instances:

```
GET https://discover.api.seequent.com/evo/identity/v2/discovery?service=evo
Authorization: Bearer <access_token>
```

The `organizations` array in the response contains each instance:

```json
{
  "discovery": {
    "organizations": [
      { "id": "d0ea331e-...", "display_name": "Acme Mining" },
      { "id": "7f2b9a01-...", "display_name": "GeoStar Exploration" }
    ]
  }
}
```

See [discovery-api.yaml](discovery-api.yaml) for the full response schema.

## Resolving the hub URL for an instance

Each instance resides on one regional hub. After the user selects an instance, resolve
the hub URL from the same discovery response:

1. Find the entry in `service_access` where `org_id` matches the instance `id`.
2. Use the `hub_code` from that entry to look up the `url` in the `hubs` array.

```typescript
function resolveHubUrl(
  discovery: DiscoveryResponse,
  instanceId: string,
): string {
  const access = discovery.service_access
    .find((sa) => sa.org_id === instanceId);
  const hub = discovery.hubs
    .find((h) => h.code === access?.hub_code);
  return hub?.url;
}
```

The resolved hub URL is the base URL for all subsequent Evo API calls for that instance.

## UX: instance selection

### When to prompt

- **Single instance** — skip the picker and select automatically.
- **Multiple instances** — present a selector. Use `display_name` as the label.

### Recommended UI pattern

It is usually preferable to let the user switch instances from within the app (e.g. a
dropdown in the app header) rather than requiring a separate selection screen on every
login. If the user has a persisted selection, restore it and go straight to the app.

Only show a dedicated instance picker when there is no persisted selection or it is no
longer valid.

```
┌──────────────────────────────────┐
│  Select an Evo instance          │
│                                  │
│  ● Acme Mining                   │
│  ○ GeoStar Exploration           │
│                                  │
│              [Continue]          │
└──────────────────────────────────│
```

### What to store

When an instance is selected, store:

| Value | Purpose |
|-------|---------|
| `id` | Used in API paths (e.g. `/orgs/{id}/workspaces`) |
| `display_name` | Shown in the UI |
| Hub `url` | Base URL for API calls |

These three values together form the "active instance context" for the app.

## Persisting the selection

Instance selection uses a hybrid storage strategy to handle multiple tabs correctly:

- **`sessionStorage`** — the tab's active instance. This is the source of truth for the
  current tab and survives page refreshes.
- **`localStorage`** — the most recent _active selection_ across all tabs. Used only to
  seed new tabs/sessions with a sensible default.

### When to write

| Event | `sessionStorage` | `localStorage` |
|-------|-------------------|----------------|
| User explicitly selects an instance | ✅ Write | ✅ Write |
| App restores selection on load | ✅ Write | ❌ Do not write |

Only write to `localStorage` when the user actively chooses an instance (via the picker
or an in-app switcher). Do **not** update `localStorage` when restoring a selection on
page load — otherwise, simply opening a tab would overwrite another tab's deliberate
choice.

### Restore logic on app load

```typescript
function restoreInstanceId(): string | null {
  // Prefer this tab's own selection
  return sessionStorage.getItem("evo_instance_id")
    ?? localStorage.getItem("evo_instance_id");
}
```

### Selection logic

```typescript
function selectInstance(instanceId: string): void {
  // Active selection — write to both stores
  sessionStorage.setItem("evo_instance_id", instanceId);
  localStorage.setItem("evo_instance_id", instanceId);
}
```

### Validation

On app load, always validate the restored ID against the current discovery response —
the user may have lost access since the last session.

```typescript
const restoredId = restoreInstanceId();
const stillValid = discovery.organizations.some((o) => o.id === restoredId);
if (!stillValid) {
  sessionStorage.removeItem("evo_instance_id");
  // Prompt user to select an instance
}
```

### Multi-tab behaviour

With this approach:

- Each tab operates independently against its own instance.
- Opening a new tab defaults to the most recently _selected_ instance.
- Refreshing a tab keeps its own selection (from `sessionStorage`).
- Switching instance in one tab does not affect other open tabs.

## Caching the discovery response

The discovery response (instances, hubs, service access) is typically valid for the
duration of a single session. Cache it in memory or `sessionStorage` after login and
reuse it — there is no need to re-fetch discovery on every page navigation. Re-fetch
only when the user re-authenticates or when you have reason to believe the data may
have changed.

## Switching instances

Since the app only works with one instance at a time, switching instances effectively
resets the app's data context. When the user switches:

1. Call `selectInstance()` to update both `sessionStorage` and `localStorage`.
2. Clear **all** cached data from the previous instance (workspaces, objects, etc.).
3. Re-fetch data for the new instance context.

No re-authentication is needed — the same access token works across all instances the user
has access to. However, the hub URL will likely change, so all API clients must be
updated to use the new base URL.

## Further reading

- [Evo Discovery Guide](https://developer.seequent.com/docs/guides/getting-started/discovery) —
  instance and hub concepts
- [Workspaces Guide](https://developer.seequent.com/docs/guides/workspaces) —
  working with workspaces within an instance
