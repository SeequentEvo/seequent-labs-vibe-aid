# Setup

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- A Bentley IMS OAuth client ID — [register here](https://developer.bentley.com/)

## Install and run

```bash
npm install
cp .env.example .env   # then add your VITE_IMS_CLIENT_ID
npm run dev             # opens http://localhost:5173
```

## Registering your app

Register a new application at the [Bentley developer portal](https://developer.bentley.com/) with the following settings:

| Setting | Value |
|---------|-------|
| Application type | SPA |
| Redirect URI | `http://localhost:5173/callback` |
| Post-logout redirect URI | `http://localhost:5173/login` |

Add additional redirect URIs for any deployed environments.

## Environment variables

Configured via `.env` for local development. For deployed builds, set values via `process.env` in CI — the Vite config bridges them automatically.

See [`.env.example`](.env.example) for all available variables.

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_IMS_BASE_URL` | Bentley IMS base URL | `https://ims.bentley.com` |
| `VITE_IMS_CLIENT_ID` | OAuth client ID | *(required)* |
| `VITE_IMS_SCOPES` | OAuth scopes (space-separated) | `evo.discovery evo.workspace` |
| `VITE_EVO_DISCOVERY_BASE_URL` | Evo Discovery API base URL | `https://discover.api.seequent.com` |

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Type-check with `tsc` then build for production |
| `npm run lint` | Lint all files with ESLint |
| `npm run preview` | Serve the production build locally |

For project structure and architecture details, see the [README](README.md).
