import { createSlice, createAsyncThunk, type PayloadAction } from "@reduxjs/toolkit";
import { fetchDiscovery, resolveInstances } from "@/api/evo";
import type { EvoInstance } from "@/types/evo";

interface InstanceState {
  /** All instances from the most recent discovery response. */
  instances: EvoInstance[];
  /** The currently selected instance (one at a time). */
  selected: EvoInstance | null;
  /** Discovery fetch status. */
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
}

/**
 * Instance-ID persistence keys.
 *
 * The app stores the selected instance ID in two browser stores:
 * - **sessionStorage** (`INSTANCE_SESSION_KEY`) — current-tab selection, cleared on logout.
 * - **localStorage** (`INSTANCE_LOCAL_KEY`) — last-used instance, deliberately retained
 *   across logouts so returning users auto-redirect to their previous instance.
 *
 * On read (InstancePicker), sessionStorage is preferred; localStorage is the fallback.
 */
export const INSTANCE_SESSION_KEY = "evo_instance_id";
export const INSTANCE_LOCAL_KEY = "evo_instance_id";

const initialState: InstanceState = {
  instances: [],
  selected: null,
  status: "idle",
  error: null,
};

/** Fetch discovery and resolve instances. Auto-selects if persisted or single instance. */
export const discoverInstances = createAsyncThunk(
  "instance/discover",
  async (accessToken: string) => {
    const response = await fetchDiscovery(accessToken);
    return resolveInstances(response);
  },
);

const instanceSlice = createSlice({
  name: "instance",
  initialState,
  reducers: {
    /** User explicitly selects an instance — writes to both stores. */
    selectInstance(state, action: PayloadAction<EvoInstance>) {
      state.selected = action.payload;
      sessionStorage.setItem(INSTANCE_SESSION_KEY, action.payload.id);
      localStorage.setItem(INSTANCE_LOCAL_KEY, action.payload.id);
    },
    /** Clear current instance selection. localStorage is intentionally preserved — see storage-key JSDoc. */
    clearInstance(state) {
      state.selected = null;
      state.instances = [];
      state.status = "idle";
      state.error = null;
      sessionStorage.removeItem(INSTANCE_SESSION_KEY);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(discoverInstances.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(discoverInstances.fulfilled, (state, action) => {
        state.instances = action.payload;
        state.status = "ready";
        state.error = null;
        // Instance selection is driven by the URL (/instances/:instanceId route).
        // The InstancePicker page handles redirect for persisted/single instance.
      })
      .addCase(discoverInstances.rejected, (state, action) => {
        state.status = "error";
        state.error = action.error.message ?? "Discovery failed";
      });
  },
});

export const { selectInstance, clearInstance } = instanceSlice.actions;
export default instanceSlice.reducer;

// Selectors
export const selectInstances = (state: { instance: InstanceState }) =>
  state.instance.instances;
export const selectSelectedInstance = (state: { instance: InstanceState }) =>
  state.instance.selected;
export const selectInstanceStatus = (state: { instance: InstanceState }) =>
  state.instance.status;
export const selectInstanceError = (state: { instance: InstanceState }) =>
  state.instance.error;
