import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAppSelector, useAppDispatch } from "@/hooks/useStore";
import { selectAuthStatus, selectAccessToken } from "@/store/authSlice";
import {
  discoverInstances,
  selectInstanceStatus,
  selectInstanceError,
} from "@/store/instanceSlice";

/** Wraps routes that require authentication and completed discovery. */
export default function AuthGuard() {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const authStatus = useAppSelector(selectAuthStatus);
  const accessToken = useAppSelector(selectAccessToken);
  const instanceStatus = useAppSelector(selectInstanceStatus);
  const instanceError = useAppSelector(selectInstanceError);

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
