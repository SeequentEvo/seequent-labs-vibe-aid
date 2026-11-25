import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/hooks/useStore";
import { logout, selectIdToken } from "@/store/authSlice";
import { clearInstance } from "@/store/instanceSlice";
import { clearWorkspaces } from "@/store/workspacesSlice";
import { buildLogoutUrl } from "@/api/auth";
import { getBlobStore } from "@/api/evo/blob";

export default function Logout() {
  const dispatch = useAppDispatch();
  const idToken = useAppSelector(selectIdToken);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    // Capture the logout URL before clearing state — idToken is needed for id_token_hint
    const logoutUrl = buildLogoutUrl(idToken ?? undefined);

    void (async () => {
      // Clear cached proprietary data before leaving the signed-in session.
      try {
        const blobStore = await getBlobStore();
        await blobStore.clearAll();
      } catch {
        // Logout must still complete if storage is unavailable or already restricted.
      }

      dispatch(clearWorkspaces());
      dispatch(clearInstance());
      dispatch(logout());
      window.location.href = logoutUrl;
    })();
  }, [dispatch, idToken]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-500">Signing out…</div>
    </div>
  );
}
