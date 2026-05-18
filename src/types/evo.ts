import type { HubCode, OrgId, UserId, WorkspaceId } from "./ids";

/** Types for the Evo Discovery API response. */

export interface DiscoveryOrganization {
  id: OrgId;
  display_name: string;
}

export interface DiscoveryHub {
  code: string;
  display_name: string;
  url: string;
}

export interface DiscoveryService {
  code: string;
  display_name: string;
}

export interface DiscoveryServiceAccess {
  hub_code: string;
  org_id: OrgId;
  services: string[];
}

export interface DiscoveryResponseContent {
  organizations: DiscoveryOrganization[];
  hubs: DiscoveryHub[];
  services: DiscoveryService[];
  service_access: DiscoveryServiceAccess[];
}

export interface DiscoveryResponse {
  discovery: DiscoveryResponseContent;
}

/** Resolved Evo instance with hub details. */
export interface EvoInstance {
  id: OrgId;
  displayName: string;
  hubUrl: string;
  hubCode: HubCode;
  hubDisplayName: string;
}


/** Lightweight workspace for selectors and lists. */
export interface WorkspaceSummary {
  id: WorkspaceId;
  name: string;
}

/** An Evo platform user. May have access to multiple instances and workspaces. */
export interface EvoUser {
  id: UserId;
  name: string;
  email: string;
}

export type WorkspaceRole = "owner" | "editor" | "viewer";

/** Full workspace object from the Workspaces API. */
export interface Workspace extends WorkspaceSummary {
  description: string;
  current_user_role: WorkspaceRole;
  created_at: string;
  created_by: EvoUser;
  updated_at: string;
  updated_by: EvoUser;
  labels: string[];
  self_link: string;
}
