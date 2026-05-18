import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/hooks/useStore";
import { logout, selectIdToken } from "@/store/authSlice";
import { clearInstance } from "@/store/instanceSlice";
import { clearWorkspaces } from "@/store/workspacesSlice";
import { buildLogoutUrl } from "@/api/auth";

export default function Logout() {
  const dispatch = useAppDispatch();
  const idToken = useAppSelector(selectIdToken);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    // Capture the logout URL before clearing state — idToken is needed for id_token_hint
    const logoutUrl = buildLogoutUrl(idToken ?? undefined);

    // Clear local auth and instance state, then redirect to IMS.
    dispatch(clearWorkspaces());
    dispatch(clearInstance());
    dispatch(logout());
    window.location.href = logoutUrl;
  }, [dispatch, idToken]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-500">Signing out…</div>
    </div>
  );
}
