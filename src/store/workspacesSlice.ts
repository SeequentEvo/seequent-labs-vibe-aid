import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { fetchWorkspaces, fetchWorkspaceSummaries } from "@/api/evo";
import type { WorkspaceSummary } from "@/api/evo";
import type { Workspace } from "@/types/evo";
import type { OrgId } from "@/types/ids";

interface WorkspaceState {
  workspaces: Workspace[];
  total: number;
  status: "idle" | "loading" | "ready" | "loading-more" | "error";
  error: string | null;
  /** Lightweight summaries (id + name) for selectors. Loaded independently. */
  summaries: WorkspaceSummary[];
  summariesStatus: "idle" | "loading" | "ready" | "error";
  summariesError: string | null;
}

const PAGE_SIZE = 20;

const initialState: WorkspaceState = {
  workspaces: [],
  total: 0,
  status: "idle",
  error: null,
  summaries: [],
  summariesStatus: "idle",
  summariesError: null,
};

/** Fetch the first page of workspaces for the selected instance. */
export const loadWorkspaces = createAsyncThunk(
  "workspaces/load",
  async (params: { hubUrl: string; orgId: OrgId; accessToken: string }) => {
    return fetchWorkspaces(params.hubUrl, params.orgId, params.accessToken, {
      limit: PAGE_SIZE,
      offset: 0,
      orderBy: "desc:updated_at",
    });
  },
);

/** Fetch the next page (endless scroll). */
export const loadMoreWorkspaces = createAsyncThunk(
  "workspaces/loadMore",
  async (
    params: { hubUrl: string; orgId: OrgId; accessToken: string },
    { getState },
  ) => {
    const state = getState() as { workspaces: WorkspaceState };
    const offset = state.workspaces.workspaces.length;
    return fetchWorkspaces(params.hubUrl, params.orgId, params.accessToken, {
      limit: PAGE_SIZE,
      offset,
      orderBy: "desc:updated_at",
    });
  },
);

/** Fetch the full list of workspace summaries (id + name) for selectors. */
export const loadWorkspaceSummaries = createAsyncThunk(
  "workspaces/loadSummaries",
  async (params: { hubUrl: string; orgId: OrgId; accessToken: string }) => {
    return fetchWorkspaceSummaries(
      params.hubUrl,
      params.orgId,
      params.accessToken,
    );
  },
);

const workspacesSlice = createSlice({
  name: "workspaces",
  initialState,
  reducers: {
    clearWorkspaces() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadWorkspaces.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(loadWorkspaces.fulfilled, (state, action) => {
        state.workspaces = action.payload.items;
        state.total = action.payload.total;
        state.status = "ready";
      })
      .addCase(loadWorkspaces.rejected, (state, action) => {
        state.status = "error";
        state.error = action.error.message ?? "Failed to load workspaces";
      })
      .addCase(loadMoreWorkspaces.pending, (state) => {
        state.status = "loading-more";
      })
      .addCase(loadMoreWorkspaces.fulfilled, (state, action) => {
        state.workspaces.push(...action.payload.items);
        state.total = action.payload.total;
        state.status = "ready";
      })
      .addCase(loadMoreWorkspaces.rejected, (state, action) => {
        state.status = "error";
        state.error = action.error.message ?? "Failed to load more workspaces";
      })
      .addCase(loadWorkspaceSummaries.pending, (state) => {
        state.summariesStatus = "loading";
        state.summariesError = null;
      })
      .addCase(loadWorkspaceSummaries.fulfilled, (state, action) => {
        state.summaries = action.payload;
        state.summariesStatus = "ready";
      })
      .addCase(loadWorkspaceSummaries.rejected, (state, action) => {
        state.summariesStatus = "error";
        state.summariesError =
          action.error.message ?? "Failed to load workspace summaries";
      });
  },
});

export const { clearWorkspaces } = workspacesSlice.actions;
export default workspacesSlice.reducer;

export const selectWorkspaces = (state: { workspaces: WorkspaceState }) =>
  state.workspaces.workspaces;
export const selectWorkspacesTotal = (state: { workspaces: WorkspaceState }) =>
  state.workspaces.total;
export const selectWorkspacesStatus = (state: { workspaces: WorkspaceState }) =>
  state.workspaces.status;
export const selectWorkspacesError = (state: { workspaces: WorkspaceState }) =>
  state.workspaces.error;
export const selectWorkspaceSummaries = (state: {
  workspaces: WorkspaceState;
}) => state.workspaces.summaries;
export const selectWorkspaceSummariesStatus = (state: {
  workspaces: WorkspaceState;
}) => state.workspaces.summariesStatus;
