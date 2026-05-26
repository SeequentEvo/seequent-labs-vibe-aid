# Creating a Client ID for Your Evo App

This guide walks through creating an OAuth application client ID on developer.seequent.com
so you can authenticate users in your Vibe Aid app. You'll end up with a **client ID** to
put in your `.env` file.

## Prerequisites

You need a Bentley account. If you don't have one, create one at
[ims.bentley.com](https://ims.bentley.com/).

## Step 1: Open the My Apps page

Go to [developer.seequent.com/my-apps](https://developer.seequent.com/my-apps).

Sign in with your Bentley account if prompted.

## Step 2: Click "Create app"

On the My Apps page, click the **"Create app"** button to open the app creation form.

## Step 3: Fill in the form

The form has the following fields:

### Application Name

Choose a name that identifies your app (e.g., "My Geo Viewer" or "Vibe Aid Local Dev").
This name is displayed to users during the consent screen.

### Application Type

Select **SPA** (Single Page Application). This template is a single-page application that
runs entirely in the browser with no backend server.

The PKCE authentication flow used by this template requires SPA as the application type.

### Redirect URIs

Click **"+ Add new redirect URI"** and add:

```
http://localhost:5173/callback
```

This is where Bentley IMS sends the user after they sign in. It must match exactly —
including the port number and path.

If you deploy the app to other environments later, add their redirect URIs too (e.g.,
`https://myapp.example.com/callback`).

### Post-Logout Redirect URIs

Click **"+ Add new post logout redirect URI"** and add:

```
http://localhost:5173/login
```

This is where Bentley IMS sends the user after they sign out. Again, it must match exactly.

Add deployed environment URIs here too if applicable.

## Step 4: Create the app and copy your client ID

Click the **"Create app"** button at the bottom of the form. Your app will be created and you'll
receive a **client ID**. Copy it — you'll need it in the next step.

There is no client secret for SPA applications. The PKCE flow used by this template doesn't
require one.

## Step 5: Add the client ID to your project

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
| Consent screen shows wrong app name | Application name in registration | Edit the app name at developer.seequent.com/my-apps |
| Cannot create app | Bentley account doesn't have permission | Contact your organisation's account manager to grant app creation permissions |
