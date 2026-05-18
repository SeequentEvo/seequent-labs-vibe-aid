/**
 * Bentley IMS OAuth endpoints and auth flow functions.
 *
 * Uses hardcoded paths appended to the configurable IMS base URL.
 * Implements the Authorization Code flow with PKCE (no client secret).
 */

import { generateCodeVerifier, generateCodeChallenge } from "./pkce";

const IMS_PATHS = {
  authorize: "/connect/authorize",
  token: "/connect/token",
  endSession: "/connect/endsession",
} as const;

function getImsUrl(path: string): string {
  const baseUrl = import.meta.env.VITE_IMS_BASE_URL.replace(/\/+$/, "");
  return `${baseUrl}${path}`;
}

const PKCE_VERIFIER_KEY = "pkce_code_verifier";
const PKCE_STATE_KEY = "pkce_state";

function getRedirectUri(): string {
  return `${window.location.origin}/callback`;
}

function getPostLogoutRedirectUri(): string {
  return `${window.location.origin}/login`;
}

/** Initiate the OAuth PKCE login flow by redirecting to IMS. */
export async function startLogin(): Promise<void> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = crypto.randomUUID();

  sessionStorage.setItem(PKCE_VERIFIER_KEY, codeVerifier);
  sessionStorage.setItem(PKCE_STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: import.meta.env.VITE_IMS_CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: import.meta.env.VITE_IMS_SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });

  window.location.href = `${getImsUrl(IMS_PATHS.authorize)}?${params}`;
}

/** Token response from the IMS token endpoint. */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

/** Exchange the authorization code for tokens. */
export async function exchangeCode(code: string, state: string): Promise<TokenResponse> {
  const savedState = sessionStorage.getItem(PKCE_STATE_KEY);
  if (state !== savedState) {
    throw new Error("OAuth state mismatch — possible CSRF attack");
  }

  const codeVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  if (!codeVerifier) {
    throw new Error("Missing PKCE code verifier — login flow may have expired");
  }

  const response = await fetch(getImsUrl(IMS_PATHS.token), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: import.meta.env.VITE_IMS_CLIENT_ID,
      redirect_uri: getRedirectUri(),
      code,
      code_verifier: codeVerifier,
    }),
  });

  // Clean up PKCE state
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(PKCE_STATE_KEY);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${errorBody}`);
  }

  return response.json() as Promise<TokenResponse>;
}

/** User info decoded from the ID token JWT payload. */
export interface UserInfo {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  preferred_username?: string;
}

/** Decode the unverified payload of any JWT (access token, ID token, etc.). */
export function decodeJwtClaims(token: string): UserInfo {
  const parts = token.split(".");
  const payload = parts[1];
  if (!payload) {
    throw new Error("Invalid JWT — missing payload");
  }
  const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json) as UserInfo;
}

/** Build the IMS end-session (logout) URL. */
export function buildLogoutUrl(idToken?: string): string {
  const params = new URLSearchParams({
    post_logout_redirect_uri: getPostLogoutRedirectUri(),
  });
  if (idToken) {
    params.set("id_token_hint", idToken);
  }
  return `${getImsUrl(IMS_PATHS.endSession)}?${params}`;
}
