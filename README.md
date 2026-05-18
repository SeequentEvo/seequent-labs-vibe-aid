# Vibe Aid

A starter template for AI-assisted ("vibe coding") development of geoscience web applications that connect to the [Seequent Evo](https://www.seequent.com/evo/) data platform. Designed to be scaffolded and extended by AI coding agents with minimal friction.

## Getting started

Follow the setup instructions in [SETUP.md](SETUP.md) to configure your environment and run the app locally.

## What's included

The template ships with a working app that covers the foundational Evo integration:

- **Authentication** — OAuth 2.0 PKCE flow via Bentley IMS (no client secret required)
- **Token management** — access tokens persisted in sessionStorage, cleared on tab close
- **Guarded routing** — `AuthGuard` redirects unauthenticated users to sign in
- **Instance discovery** — resolves Evo instances (organisations + hub URLs) the user can access, with `InstanceGuard` ensuring a valid selection
- **Workspace listing** — browse and select workspaces within a chosen instance
- **Agent skills** — a library of Evo platform skills that teach AI agents how to integrate with each service (see [AGENTS.md](AGENTS.md))

### Route structure

`/login` → `/` (instance picker) → `/:instanceId/workspaces` → …

Auth, discovery, and workspace listing are fully wired up. Build from here.

## Tech stack

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

## See also

- [SETUP.md](SETUP.md) — environment configuration, IMS registration, and dev scripts
- [AGENTS.md](AGENTS.md) — instructions and skills for AI coding agents
- [Seequent Evo](https://evo.seequent.com/) — Seequent Evo data platform
- [Seequent Evo Developer Docs](https://developer.seequent.com/) — API documentation and guides

## License

TBD
