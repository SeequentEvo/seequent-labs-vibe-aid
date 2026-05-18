import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./authSlice";
import instanceReducer from "./instanceSlice";
import workspacesReducer from "./workspacesSlice";
import { blobCacheReducer } from "./blobCacheSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    instance: instanceReducer,
    workspaces: workspacesReducer,
    blobCache: blobCacheReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
