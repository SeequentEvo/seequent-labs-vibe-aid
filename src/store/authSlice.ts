import { createSlice, createAsyncThunk, createSelector } from "@reduxjs/toolkit";
import {
  exchangeCode,
  decodeJwtClaims,
  type TokenResponse,
  type UserInfo,
} from "@/api/auth";
import type { EvoUser } from "@/types/evo";
import { parseUserId } from "@/types/ids";

interface AuthState {
  status: "idle" | "loading" | "authenticated" | "error";
  accessToken: string | null;
  idToken: string | null;
  user: UserInfo | null;
  error: string | null;
  expiresAt: number | null;
}

const SESSION_KEY = "auth_state";

function loadPersistedState(): AuthState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const persisted = JSON.parse(raw) as AuthState;
    if (persisted.expiresAt && persisted.expiresAt < Date.now()) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return persisted;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function persistState(state: AuthState): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      status: state.status,
      accessToken: state.accessToken,
      idToken: state.idToken,
      user: state.user,
      expiresAt: state.expiresAt,
    }));
  } catch {
    // sessionStorage full or unavailable — degrade gracefully
  }
}

const defaultState: AuthState = {
  status: "idle",
  accessToken: null,
  idToken: null,
  user: null,
  error: null,
  expiresAt: null,
};

const initialState: AuthState = loadPersistedState() ?? defaultState;

/** Handle the OAuth callback: exchange code for tokens, then decode user info from access token. */
export const handleCallback = createAsyncThunk(
  "auth/handleCallback",
  async ({ code, state }: { code: string; state: string }) => {
    const tokens: TokenResponse = await exchangeCode(code, state);
    const user = decodeJwtClaims(tokens.access_token);
    return { tokens, user };
  }
);

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    logout(state) {
      state.status = "idle";
      state.accessToken = null;
      state.idToken = null;
      state.user = null;
      state.error = null;
      state.expiresAt = null;
      sessionStorage.removeItem(SESSION_KEY);
    },
    clearError(state) {
      state.error = null;
      if (state.status === "error") {
        state.status = "idle";
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(handleCallback.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(handleCallback.fulfilled, (state, action) => {
        const { tokens, user } = action.payload;
        state.status = "authenticated";
        state.accessToken = tokens.access_token;
        state.idToken = tokens.id_token ?? null;
        state.user = user;
        state.expiresAt = Date.now() + tokens.expires_in * 1000;
        state.error = null;
        persistState(state);
      })
      .addCase(handleCallback.rejected, (state, action) => {
        state.status = "error";
        state.error = action.error.message ?? "Authentication failed";
      });
  },
});

export const { logout, clearError } = authSlice.actions;
export default authSlice.reducer;

// Selectors
export const selectAuthStatus = (state: { auth: AuthState }) => state.auth.status;
export const selectAccessToken = (state: { auth: AuthState }) => state.auth.accessToken;
export const selectUser = (state: { auth: AuthState }) => state.auth.user;
export const selectIdToken = (state: { auth: AuthState }) => state.auth.idToken;
export const selectAuthError = (state: { auth: AuthState }) => state.auth.error;

export const selectEvoUser = createSelector(
  [selectUser],
  (user): EvoUser | null => {
    if (!user) return null;
    const nameParts = [user.given_name, user.family_name].filter(Boolean);
    return {
      id: parseUserId(user.sub),
      name: nameParts.join(" ") || user.preferred_username || user.email || "Unknown",
      email: user.email ?? "",
    };
  },
);
