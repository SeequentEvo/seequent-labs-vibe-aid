import { useState, useEffect } from "react";
import type { Workspace } from "@/types/evo";
import type { OrgId } from "@/types/ids";
import { getWorkspaceThumbnailUrl } from "@/api/evo";

// Tracks workspace thumbnails that returned 404/error to avoid repeated requests on re-mount.
const failedThumbnails = new Set<string>();

const roleBadgeStyles: Record<string, string> = {
  owner: "bg-purple-100 text-purple-700",
  editor: "bg-blue-100 text-blue-700",
  viewer: "bg-gray-100 text-gray-600",
};

interface WorkspaceCardProps {
  workspace: Workspace;
  hubUrl: string;
  orgId: OrgId;
  accessToken: string;
}

export default function WorkspaceCard({
  workspace,
  hubUrl,
  orgId,
  accessToken,
}: WorkspaceCardProps) {
  const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(null);

  useEffect(() => {
    const cacheKey = `${hubUrl}|${orgId}|${workspace.id}`;
    if (failedThumbnails.has(cacheKey)) return;

    const url = getWorkspaceThumbnailUrl(hubUrl, orgId, workspace.id);
    let revoked = false;
    let objectUrl: string | null = null;

    fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((res) => {
        if (!res.ok) throw new Error("No thumbnail");
        return res.blob();
      })
      .then((blob) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setThumbnailSrc(objectUrl);
      })
      .catch(() => {
        failedThumbnails.add(cacheKey);
      });

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [hubUrl, orgId, workspace.id, accessToken]);

  const badgeStyle = roleBadgeStyles[workspace.current_user_role] ?? roleBadgeStyles.viewer;

  return (
    <div className="bg-white rounded-lg shadow hover:shadow-md transition-shadow overflow-hidden">
      {/* Thumbnail */}
      <div className="h-36 bg-gray-100 flex items-center justify-center">
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            alt={`${workspace.name} thumbnail`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-gray-300 text-4xl">🗂</div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-2">
        <h3 className="font-semibold text-gray-900 truncate" title={workspace.name}>
          {workspace.name}
        </h3>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 truncate" title={workspace.created_by.name}>
            {workspace.created_by.name}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeStyle}`}>
            {workspace.current_user_role}
          </span>
        </div>

      </div>
    </div>
  );
}
