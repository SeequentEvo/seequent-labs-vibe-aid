# Evo Data Models

Standardised data models for Evo-connected apps. These types are derived from the
Discovery API response and decoded access token claims. When implementing, create
corresponding TypeScript interfaces in `src/`.

## EvoInstance

Represents a single Evo instance as returned by the Discovery API, enriched with the
resolved hub URL. Used for instance selection and as the active instance context
throughout the app.

```typescript
interface EvoInstance {
  /** Instance ID (from `organizations[].id` in the discovery response). */
  id: string;

  /** Human-readable name (from `organizations[].display_name`). */
  displayName: string;

  /** Resolved hub API base URL (from `hubs[].url` via `service_access`). */
  hubUrl: string;

  /** Hub region code (from `service_access[].hub_code`, e.g. "au", "us", "eu"). */
  hubCode: string;

  /** Hub region display name (from `hubs[].display_name`, e.g. "Australia East"). */
  hubDisplayName: string;
}
```

### Notes

- `hubUrl` is the base URL for all Evo API calls scoped to this instance.
- `hubCode` and `hubDisplayName` are useful when data residency matters — the app can
  display the region to the user so they know where their data is hosted.
- Build `EvoInstance` by joining `organizations`, `service_access`, and `hubs` from the
  discovery response. See [evo-instances.md](evo-instances.md) for the resolution logic.

## EvoUser

Represents the authenticated user. Derived from the decoded access token JWT (since
standard OIDC scopes are not available for Evo app registrations).

```typescript
interface EvoUser {
  /** User's unique identifier (from `sub` claim). */
  id: string;

  /** First name (from `given_name` claim). */
  givenName: string;

  /** Last name (from `family_name` claim). */
  familyName: string;

  /** Full display name, formatted as `givenName familyName`. */
  displayName: string;

  /** Email address (from `email` claim). */
  email: string;
}
```

### Notes

- Do **not** use the `preferred_username` claim — it is unreliable and cannot be corrected
  by the user.
- `displayName` is derived (not a raw claim) — construct it as
  `${givenName} ${familyName}`.

## AppContext

Combines the active user and selected instance into a single object that represents the
current app context. Useful for UI chrome (header, sidebar) and for passing to API
clients.

```typescript
interface AppContext {
  /** The authenticated user. Always present after login. */
  user: EvoUser;

  /** The currently selected instance. Null until the user selects one. */
  instance: EvoInstance | null;
}
```

### What to display

A typical app header shows the user and active instance on two lines:

```
┌──────────────────────────────────────────┐
│                          Jane Smith      │
│                          Acme Mining  [▾]│
└──────────────────────────────────────────┘
```

| Element | Source | Style |
|---------|--------|-------|
| User name | `user.displayName` | Primary text |
| Instance name | `instance.displayName` | Secondary text |

The instance name doubles as the instance switcher control (dropdown or link to picker).

### Data residency

Do not show hub region in the app header by default. If data residency needs to be
surfaced (a conscious product decision), show `instance.hubDisplayName` alongside each
instance in the **instance selector** — not in the header.

```
┌──────────────────────────────────┐
│  Select an Evo instance          │
│                                  │
│  ● Acme Mining (Australia East)  │
│  ○ GeoStar Exploration (US East) │
│                                  │
│              [Continue]          │
└──────────────────────────────────┘
```
