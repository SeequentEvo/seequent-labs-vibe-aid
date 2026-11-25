import { useState } from "react";
import { useAppDispatch, useAppSelector } from "@/hooks/useStore";
import { logout, selectIdToken } from "@/store/authSlice";
import { clearInstance } from "@/store/instanceSlice";
import { clearWorkspaces } from "@/store/workspacesSlice";
import { buildLogoutUrl } from "@/api/auth";
import { getBlobStore } from "@/api/evo/blob";
import { clearEvoOrigins } from "@/api/evo/allowlist";

export default function Logout() {
  const dispatch = useAppDispatch();
  const idToken = useAppSelector(selectIdToken);
  const [signingOut, setSigningOut] = useState(false);

  const confirmLogout = (): void => {
    if (signingOut) return;
    setSigningOut(true);

    const logoutUrl = buildLogoutUrl(idToken ?? undefined);
    void (async () => {
      try {
        const blobStore = await getBlobStore();
        await blobStore.clearAll();
      } catch {
        // Logout must still complete if storage is unavailable or already restricted.
      }

      dispatch(clearWorkspaces());
      dispatch(clearInstance());
      dispatch(logout());
      clearEvoOrigins();
      window.location.href = logoutUrl;
    })();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-3">Sign out?</h1>
        <p className="text-gray-600 mb-6">
          This will clear your session and cached Evo data on this device.
        </p>
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={() => window.history.back()}
            disabled={signingOut}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmLogout}
            disabled={signingOut}
            className="px-4 py-2 rounded-lg bg-red-600 text-white disabled:opacity-50"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  );
}
