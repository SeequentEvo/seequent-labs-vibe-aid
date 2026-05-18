# Registering a Bentley IMS Application

This guide walks through registering a new OAuth application with Bentley IMS so you can
authenticate users in your Vibe Aid app. You'll end up with a **client ID** to put in your
`.env` file.

## Prerequisites

You need a Bentley account. If you don't have one, create one at
[ims.bentley.com](https://ims.bentley.com/).

## Step 1: Open the registration form

Go directly to the Seequent Evo app registration page:

```
https://developer.bentley.com/register/?product=seequent-evo
```

Sign in with your Bentley account if prompted.

This link is the preferred route. The alternative is to sign in to
[developer.bentley.com](https://developer.bentley.com/), open **My Apps** from the user
menu (top-right), and use the dropdown on the **+ Register New** button to select
**Register new app for Seequent Evo**. The default "+ Register New" action registers an
iTwin app, which is not what you want.

### "You do not have permission to create, modify or delete applications"

If you see this message, your account doesn't have the required role. Contact your
organisation's account manager and ask them to grant you permission to register applications
on the Bentley developer portal. You cannot proceed until this is resolved.

## Step 2: Fill in the registration form

The form has the following fields:

### Application Name

Choose a name that identifies your app (e.g., "My Geo Viewer" or "Vibe Aid Local Dev").
This is displayed to users during the consent screen.

### Application Type

Select **SPA**. This template is a single-page application that runs entirely in the browser
with no backend server.

The other options (Web App, Service, Native) are for different deployment models and will not
work with this template's PKCE authentication flow.

### Scopes

These are pre-populated by the Evo product registration link and cannot be changed on this
form. They include the Evo discovery and workspace scopes needed to interact with the
platform.

### Application Owner(s)

Defaults to your account. You can add additional owners if other team members need to manage
the app registration later.

### Redirect URIs

Add the following redirect URI:

```
http://localhost:5173/callback
```

This is where Bentley IMS sends the user after they sign in. It must match exactly — including
the port number and path.

If you deploy the app to other environments later, add their redirect URIs too (e.g.,
`https://myapp.example.com/callback`).

### Post-Logout Redirect URIs

Add the following post-logout redirect URI:

```
http://localhost:5173/login
```

This is where Bentley IMS sends the user after they sign out. Again, it must match exactly.

Add deployed environment URIs here too if applicable.

## Step 3: Submit and copy your client ID

After submitting the form, you'll receive a **client ID**. Copy it — you'll need it in the
next step.

There is no client secret for SPA applications. The PKCE flow used by this template doesn't
require one.

## Step 4: Add the client ID to your project

Set `VITE_IMS_CLIENT_ID` in your `.env` file:

```
VITE_IMS_CLIENT_ID=your-client-id-here
```

If you don't have a `.env` file yet, copy it from the example:

```bash
cp .env.example .env
```

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| "Invalid redirect_uri" after login | Redirect URI in app registration doesn't match | Ensure `http://localhost:5173/callback` is registered exactly |
| "Invalid post_logout_redirect_uri" after logout | Post-logout URI not registered | Ensure `http://localhost:5173/login` is registered exactly |
| Consent screen shows wrong app name | Application name in registration | Edit the app name at developer.bentley.com |
| Scopes missing or insufficient | Registration didn't include Evo scopes | Re-register using the `?product=seequent-evo` link |
