import { useEffect, useCallback, useRef } from "react";
import { useAppSelector, useAppDispatch } from "@/hooks/useStore";
import { selectAccessToken } from "@/store/authSlice";
import { selectSelectedInstance } from "@/store/instanceSlice";
import {
  loadWorkspaces,
  loadMoreWorkspaces,
  selectWorkspaces,
  selectWorkspacesTotal,
  selectWorkspacesStatus,
  selectWorkspacesError,
} from "@/store/workspacesSlice";
import WorkspaceCard from "@/components/WorkspaceCard";

export default function Home() {
  const dispatch = useAppDispatch();
  const accessToken = useAppSelector(selectAccessToken);
  const instance = useAppSelector(selectSelectedInstance);
  const workspaces = useAppSelector(selectWorkspaces);
  const total = useAppSelector(selectWorkspacesTotal);
  const status = useAppSelector(selectWorkspacesStatus);
  const error = useAppSelector(selectWorkspacesError);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (instance && accessToken && status === "idle") {
      dispatch(
        loadWorkspaces({
          hubUrl: instance.hubUrl,
          orgId: instance.id,
          accessToken,
        }),
      );
    }
  }, [instance, accessToken, status, dispatch]);

  const hasMore = workspaces.length < total;

  const handleLoadMore = useCallback(() => {
    if (!instance || !accessToken || !hasMore || status === "loading-more") return;
    dispatch(
      loadMoreWorkspaces({
        hubUrl: instance.hubUrl,
        orgId: instance.id,
        accessToken,
      }),
    );
  }, [instance, accessToken, hasMore, status, dispatch]);

  // Intersection observer for endless scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) handleLoadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleLoadMore]);

  if (status === "loading") {
    return (
      <div className="h-full overflow-auto">
        <div className="max-w-7xl mx-auto px-4 py-8 flex justify-center">
          <p className="text-gray-500">Loading workspaces…</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="h-full overflow-auto">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow p-6 max-w-md mx-auto">
            <h2 className="text-lg font-semibold text-red-700 mb-2">
              Failed to load workspaces
            </h2>
            <p className="text-gray-600 text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Workspaces</h1>
          {total > 0 && (
            <span className="text-sm text-gray-500">{total} workspace{total !== 1 && "s"}</span>
          )}
        </div>

        {workspaces.length === 0 && status === "ready" ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">No workspaces found in this instance.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {workspaces.map((ws) => (
              <WorkspaceCard
                key={ws.id}
                workspace={ws}
                hubUrl={instance!.hubUrl}
                orgId={instance!.id}
                accessToken={accessToken!}
              />
            ))}
          </div>
        )}

        {/* Scroll sentinel for loading more */}
        {hasMore && (
          <div ref={sentinelRef} className="flex justify-center py-4">
            {status === "loading-more" && (
              <p className="text-gray-400 text-sm">Loading more…</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

