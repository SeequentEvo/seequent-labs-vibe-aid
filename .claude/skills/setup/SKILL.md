---
name: setup
description: >
  Help a user set up and run the Vibe Aid template for the first time, or troubleshoot
  problems with their local development environment. Use this skill whenever someone says
  things like "help me get started", "how do I run this", "set up the project", "npm install
  is failing", "the app won't start", "I need to configure my environment", or asks about
  IMS client IDs, .env files, or redirect URIs. Also use when the user seems new to the
  project and hasn't run it yet — even if they don't explicitly ask for setup help.
---

# Setup

This skill walks a user through getting the Vibe Aid template running locally, and helps
troubleshoot common issues. The goal is to get from a fresh clone to a working dev server
with authentication in as few steps as possible.

Read [SETUP.md](../../../SETUP.md) for the full reference. The steps below tell you how to
guide the user through it interactively.

## First-time setup

Work through these steps in order. Verify each one succeeds before moving on.

### 1. Install dependencies

Run `npm install` and check it completes without errors.

Common issues:
- **Node version too old** — this project requires Node 20+. Check with `node -v`.

### 2. Configure environment

Check whether a `.env` file exists at the project root. If it doesn't:

1. Copy `.env.example` to `.env`
2. Ask the user for their **client ID**. If they don't have one, read
   [references/ims-registration.md](references/ims-registration.md) and walk them through
   creating an app on developer.seequent.com step by step.
3. Write the client ID into `VITE_IMS_CLIENT_ID` in `.env`

If `.env` already exists, verify `VITE_IMS_CLIENT_ID` is set to a non-empty value. If it's
blank, ask the user for it.

Never commit `.env` to version control — it's gitignored by default.

### 3. Verify the build

Run `npm run build` and check it completes cleanly. This runs both TypeScript type-checking
(`tsc -b`) and the Vite production build.

Common issues:
- **TypeScript errors** — this project uses strict mode with `noUncheckedIndexedAccess`. Index
  access on arrays and records needs undefined checks.
- **Missing environment types** — new `VITE_*` variables must be declared in
  `src/vite-env.d.ts`.

### 4. Start the dev server

Run `npm run dev` and confirm it starts on `http://localhost:5173`. The user should see a
redirect to the login page.

Common issues:
- **Port already in use** — another process is using 5173. The OAuth redirect URIs are
  hardcoded to `http://localhost:5173`, so the app **must** run on this port — authentication
  will not work on any other port. Inform the user that port 5173 is occupied and ask them
  to free it before continuing. Do not kill the other process automatically.
- **Blank page / JS errors** — check the browser console. This is often a missing or
  malformed `.env` variable.

### 5. Test authentication

Ask the user to click "Sign in" and walk through the Bentley IMS login. After authenticating,
they should be redirected back to the home page.

Common issues:
- **"Invalid redirect_uri" from IMS** — the client ID's registered redirect URI doesn't
  match `http://localhost:5173/callback`. The user needs to update their app registration
  at [developer.seequent.com/my-apps](https://developer.seequent.com/my-apps).
- **"OAuth state mismatch" error** — the user may have stale sessionStorage data. Clear
  it via the browser devtools (Application → Session Storage → clear) and try again.
- **Stuck on "Signing in…"** — the token exchange may have failed. Check the browser
  console network tab for errors on the `/connect/token` request. Common causes: wrong
  client ID or redirect URI not registered. Verify your app on developer.seequent.com/my-apps.
- **Login works but user sees an error flash** — this was a known issue with React
  StrictMode double-invoking effects. It should be fixed, but if it recurs, check that
  `Callback.tsx` uses a `useRef` guard to prevent double dispatch.

## Troubleshooting

If the user comes back with a problem after initial setup, diagnose based on symptoms:

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `npm install` fails | Node version too old or network issue | Check `node -v` (need 20+) and network connectivity |
| Build fails with type errors | Strict TypeScript mode | Fix the type errors — don't loosen the config |
| Dev server starts but page is blank | Missing `.env` or bad env values | Check `.env` has all required variables |
| Login redirects to IMS but fails | Wrong client ID or redirect URI not registered | Verify app registration at developer.seequent.com/my-apps matches exactly |
| Login succeeds but token is missing | Browser blocking sessionStorage | Check privacy/incognito settings |
| "Missing PKCE code verifier" | StrictMode double-fire or stale session | Clear sessionStorage and retry |
| Everything worked yesterday, now it doesn't | Token expired (sessionStorage) | Close and reopen the tab to clear sessionStorage |
