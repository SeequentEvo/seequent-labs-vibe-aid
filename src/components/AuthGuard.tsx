import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAppSelector, useAppDispatch } from "@/hooks/useStore";
import { getBlobStore } from "@/api/evo/blob";
import { clearEvoOrigins } from "@/api/evo/allowlist";
import {
  discoverInstances,
  selectInstanceStatus,
  selectInstanceError,
} from "@/store/instanceSlice";
import {
  logout,
  selectAuthStatus,
  selectAccessToken,
  selectAuthExpiresAt,
} from "@/store/authSlice";
import { clearInstance } from "@/store/instanceSlice";
import { clearWorkspaces } from "@/store/workspacesSlice";

/** Wraps routes that require authentication and completed discovery. */
export default function AuthGuard() {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const authStatus = useAppSelector(selectAuthStatus);
  const accessToken = useAppSelector(selectAccessToken);
  const instanceStatus = useAppSelector(selectInstanceStatus);
  const instanceError = useAppSelector(selectInstanceError);
  const expiresAt = useAppSelector(selectAuthExpiresAt);

  useEffect(() => {
    const expireSession = () => {
      void (async () => {
        try {
          const blobStore = await getBlobStore();
          await blobStore.clearAll();
          await clearEvoOrigins();
        } catch {
          // Authentication cleanup must not be blocked by restricted storage.
        }
        dispatch(clearWorkspaces());
        dispatch(clearInstance());
        dispatch(logout());
      })();
    };

    if (authStatus !== "authenticated") return;

    if (expiresAt && expiresAt <= Date.now()) {
      expireSession();
      return;
    }

    if (!expiresAt) return;

    const timeout = window.setTimeout(expireSession, Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [authStatus, expiresAt, dispatch]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleUnauthorized = () => {
      void (async () => {
        try {
          const blobStore = await getBlobStore();
          await blobStore.clearAll();
          await clearEvoOrigins();
        } catch {
          // Authentication cleanup must not be blocked by restricted storage.
        }
        dispatch(clearWorkspaces());
        dispatch(clearInstance());
        dispatch(logout());
      })();
    };

    window.addEventListener("evo:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("evo:unauthorized", handleUnauthorized);
  }, [dispatch]);

  useEffect(() => {
    if (authStatus === "authenticated" && accessToken && instanceStatus === "idle") {
      dispatch(discoverInstances(accessToken));
    }
  }, [authStatus, accessToken, instanceStatus, dispatch]);

  if (authStatus !== "authenticated") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (instanceStatus === "loading" || instanceStatus === "idle") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Discovering Evo instances…</p>
      </div>
    );
  }

  if (instanceStatus === "error") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow p-6 max-w-md">
          <h2 className="text-lg font-semibold text-red-700 mb-2">Discovery failed</h2>
          <p className="text-gray-600 text-sm">{instanceError}</p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
