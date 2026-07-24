# Seequent Labs Vibe Aid

A starter template for building geoscience web apps connected to the [Seequent Evo](https://evo.seequent.com/) data platform — designed for AI-assisted ("vibe coding") development.

**No deep coding experience required.** Describe what you want to build, and let your AI agent write the code. This is your chance to get creative and build that capability that you have always needed without needing to spend time data import and support. The more context you can provide your agent about the problem you want to solve and the app you want to build the better! 

## Disclaimer

 This template is intended for AI-assisted development. AI-generated code and content may contain errors. You are responsible for reviewing, testing, and validating all code and application behaviour before use or deployment. Bentley Systems and Seequent do not warrant the accuracy, completeness, or security of any AI-generated content created using this template. Review the [license](#license) before using this template. 

 This template has been developed by [Seequent Labs](https://labs.seequent.com) and is considered a prototype. We may choose to update or discontinue this prototype at any time without notice. 

## Before you start

You'll need:

- **Access to a Seequent Evo instance** — if you can sign in but see no instances, your account may not yet have Evo access
- **A Bentley account** — to register your app and authenticate with Evo ([create one here](https://www.bentley.com/register/))
- **[Node.js](https://nodejs.org/) 24 or later** — the JavaScript runtime
- **[Git](https://git-scm.com/)** or **[GitHub Desktop](https://desktop.github.com/)** — to clone your project



For AI-assisted development (recommended):

- An **agentic coding tool** such as [GitHub Copilot](https://github.com/features/copilot) (in VS Code or your preferred IDE), [Claude Code](https://claude.ai/code), or similar

## Getting started

### Option A — AI-assisted setup (recommended for beginners)

1. **Create your project** — on GitHub, click **[Use this template](https://github.com/new?template_name=seequent-labs-vibe-aid&template_owner=SeequentEvo) → Create a new repository**, give it a name.
2. **Download your repo** — Navigate to your repository on GitHub, click the green <>Code button. Select "Open with Github Desktop"
2. **Open the project in your AI coding tool** — load it in VS Code with Copilot, Claude Code, or whichever agent you're using
3. **Run `/setup`** — type `/setup` in your agent's chat and follow the prompts; it will walk you through registering your IMS app, configuring `.env`, and installing dependencies

Once setup completes, run:

```bash
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173). You should be able to sign in, pick an Evo instance, and see your workspaces. That means everything is working.

### Option B — Manual setup

See [SETUP.md](SETUP.md) for step-by-step instructions.

## What's included

The template ships with a working app covering the foundational Evo integration — so you can start building features on day one:

- **Authentication** — OAuth 2.0 PKCE flow via Bentley IMS (no client secret required)
- **Token management** — access tokens persisted in sessionStorage, cleared on tab close
- **Guarded routing** — `AuthGuard` redirects unauthenticated users to sign in
- **Instance discovery** — resolves Evo instances (organisations + hub URLs) the user can access
- **Workspace listing** — browse and select workspaces within a chosen instance
- **Agent skills** — built-in knowledge that teaches the AI how to work with each Evo API

Route structure: `/login` → `/` (instance picker) → `/:instanceId/workspaces` → …

## Tips for vibe coding

Prompting is a skill. A few things that help:

- **Describe what you want, not how to build it** — say "a dropdown that lists workspaces" rather than "a `<select>` element bound to Redux state"
- **Ask your Agent** - There will be bugs and your app will likely not work first time. Ask your agent explain the problem and send some screenshots this will all help get your app up and running
- **Think before you code** — many agents support a planning or reasoning mode; use it before starting a complex feature so the agent thinks it through first, which reduces mistakes
- **Work in small steps** — one feature at a time is easier to review and fix than a large batch
- **Commit when it works** — before each new feature, commit your working state so you can roll back if something breaks
- **If the output is wrong, say so clearly** — "that's not quite right, I wanted X" works better than starting over

### Example prompt to get started

```
I work as a mineral exploration geologist. I am working designing infill soil sampling on some of my projects. Build me app that lets me open my existing Pointsets I have in Evo, Plan new survey in grids on a 2D map. Here's what it should do:

1. Let the user pick a workspace, then choose a pointset (collection of 3D points) from that workspace.
2. Display the points on a 2D map using the x,y coordinates. Use satellite imagery in the background
3. Let the user choose the numeric and catergory attributes they would like to display and colour them. Add an option to edit the colour map and ranges. 
4. Design an interactive soil sample planning tool that lets the user select the area they would like to infill and plan the spacing. Show some basic overview information about the number of samples and coverage. 
5. Once the user has finished editing, show a "Save to Evo" button that uploads the modified pointset back to the same workspace. 

Show loading and error states throughout. Keep the UI clean and functional. Use a Dark  mode theme
```

## Tech stack

React 19 · TypeScript · Vite · Tailwind CSS 4 · Redux Toolkit · React Router 7

## Project structure

```
src/
├── api/
│   ├── auth/               # OAuth PKCE flow (Bentley IMS)
│   └── evo/                # Evo API clients
│       ├── blob/           # Blob transfers, OPFS cache, Parquet codec
│       ├── downhole-collection/
│       ├── downhole-intervals/
│       ├── object-bodies/  # Geoscience object body builders
│       ├── object-prepare/ # Upload preparation helpers
│       ├── object-tables/  # Tabular data decoding + schemas
│       ├── pointset/
│       └── refs/           # Typed resource references (IDs + URLs)
├── components/             # Shared UI components (Layout, AuthGuard, InstanceGuard, ...)
├── hooks/                  # Typed Redux hooks
├── lib/
│   └── arrow/              # Apache Arrow utilities
├── pages/                  # Route-level page components
├── store/                  # Redux slices (auth, blob cache, instance, workspaces)
└── types/                  # Shared TypeScript types (Evo API, geoscience objects)
```

## See also

- [SETUP.md](SETUP.md) — manual environment setup, IMS registration, dev scripts, and troubleshooting
- [AGENTS.md](AGENTS.md) — instructions and skills for AI coding agents
- [Seequent Evo](https://evo.seequent.com/) — Seequent Evo data platform
- [Seequent Evo Developer Docs](https://developer.seequent.com/) — API reference and guides

## License

[Apache 2.0](LICENSE.md) © 2026 Bentley Systems, Incorporated.

