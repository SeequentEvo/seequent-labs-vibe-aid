# Setup

This guide covers manual environment setup. If you'd prefer to be walked through it, open the project in your AI coding tool and type `/setup` — the agent will handle most of this for you.

## Prerequisites

- **[Node.js](https://nodejs.org/) 24 or later** — check with `node --version`
- **[Git](https://git-scm.com/)** or **[GitHub Desktop](https://desktop.github.com/)**
- **A Bentley account** — [register here](https://www.bentley.com/register/) if you don't have one
- **Access to a Seequent Evo organisation** — if login succeeds but you see no instances, your account may not have Evo access yet

## 1. Create your project from this template

1. On the GitHub repository page, click **Use this template → Create a new repository**
2. Choose an organisation and give your repo a name (e.g. `my-evo-app`)
3. Click **Create repository**
4. Clone your new repo and open it in your editor

## 2. Register your app with Bentley IMS

You need an OAuth client ID so your app can authenticate users against Bentley IMS.

1. Go to [developer.bentley.com/register](https://developer.bentley.com/register/?product=seequent-evo) *(use this exact link — the default iTwin app registration will not work)*
2. Give your application a descriptive name
3. Select **SPA** (Single Page Application) — this requires no client secret
4. Set the redirect URIs:

   | Field | Value |
   |-------|-------|
   | Redirect URI | `http://localhost:5173/callback` |
   | Post-logout redirect URI | `http://localhost:5173/login` |

5. Click **Register** and copy your **Client ID**

Add additional redirect URIs for any deployed environments (e.g. `https://myapp.example.com/callback`).

> **Port note:** Vite starts on `http://localhost:5173` by default. If that port is in use, Vite picks another port automatically — but your IMS redirect URI must match exactly. Stop the conflicting process or update your registered redirect URI if you see an OAuth state validation error.

## 3. Install and configure

```bash
npm install
cp .env.example .env
```

Open `.env` and fill in your client ID:

```
VITE_IMS_CLIENT_ID=your-client-id-here
```

## 4. Run the app

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Sign in, pick an Evo instance, and confirm you can see your workspaces. That's the baseline working state.

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_IMS_BASE_URL` | Bentley IMS base URL | `https://ims.bentley.com` |
| `VITE_IMS_CLIENT_ID` | OAuth client ID | *(required)* |
| `VITE_IMS_SCOPES` | OAuth scopes (space-separated) | `evo.discovery evo.workspace evo.object evo.file evo.blocksync` |
| `VITE_EVO_DISCOVERY_BASE_URL` | Evo Discovery API base URL | `https://discover.api.seequent.com` |

The default scopes allow the starter app and any AI-added features to access Evo discovery, workspaces, geoscience objects, files, and block model data. If login fails with an `invalid_scope` error, re-register using the Evo-specific link above.

See [`.env.example`](.env.example) for all available variables.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) then build for production |
| `npm run typecheck` | Type-check all project files without building |
| `npm run lint` | Lint all files with ESLint (zero warnings allowed) |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |

## Troubleshooting

**"OAuth state validation failed"**
- Your redirect URI in the Bentley portal must match exactly — including the port. Check it matches `http://localhost:5173/callback`.
- Try clearing your browser cache and cookies, then sign in again.

**"invalid_scope" error during login**
- You may have registered via the default iTwin portal instead of the Evo-specific link. Re-register at [developer.bentley.com/register/?product=seequent-evo](https://developer.bentley.com/register/?product=seequent-evo).

**"Invalid Client ID"**
- Check your `.env` file has no extra spaces, quotes, or line breaks around the client ID value.

**Signed in but no instances or workspaces appear**
- Your Bentley account may not have been granted access to an Evo organisation. Contact your Evo administrator.

**Vite starts on a different port (e.g. 5174)**
- Another process is using port 5173. Find and stop it, or update your registered redirect URI to match the new port.

For project structure and architecture, see [README.md](README.md).
