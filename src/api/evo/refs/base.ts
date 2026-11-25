import type { OrgId, WorkspaceId } from '@/types/ids';
import { parseOrgId, parseWorkspaceId } from '@/types/ids';

/** Normalise a hub URL: must be HTTPS with origin-only semantics. */
export function normaliseHubUrl(value: string): string {
  if (!value.startsWith('https://')) {
    throw new Error(`Hub URL must use https://, got: ${JSON.stringify(value)}`);
  }
  let url: URL;
  try {
    url = new URL(value.replace(/\/+$/, ''));
  } catch {
    throw new Error(`Invalid hub URL: ${JSON.stringify(value)}`);
  }
  if (url.username || url.password) {
    throw new Error(`Hub URL must not contain credentials`);
  }
  if (url.search || url.hash) {
    throw new Error(`Hub URL must not contain a query or fragment`);
  }
  if (url.pathname !== '/') {
    throw new Error(`Hub URL must not contain a path`);
  }
  return url.origin;
}

/** Encode a resource path; unsafe dot or empty segments are rejected. */
export function encodeResourcePath(path: string): string {
  if (!path) throw new Error(`Resource path must not be empty`);
  const segments = path.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Resource path contains an unsafe segment: ${JSON.stringify(path)}`);
  }
  return segments.map(encodeURIComponent).join('/');
}

/** Decode a percent-encoded resource path (decode once; do not re-split on '/'). */
export function decodeResourcePath(encoded: string): string {
  return decodeURIComponent(encoded);
}

export type EvoRefKind = 'workspace' | 'file' | 'object' | 'block-model' | 'colormap';

export abstract class EvoResourceRef {
  readonly hubUrl: string;
  readonly orgId: OrgId;
  abstract readonly kind: EvoRefKind;

  protected constructor(hubUrl: string, orgId: string) {
    this.hubUrl = normaliseHubUrl(hubUrl);
    this.orgId = parseOrgId(orgId);
  }

  abstract toUrl(): string;
  abstract equals(other: unknown): boolean;

  toString(): string {
    return this.toUrl();
  }
}

// Factory registry to avoid circular imports between base.ts and workspace.ts
let workspaceRefFactory:
  | ((hubUrl: string, orgId: string, workspaceId: string) => WorkspaceScopedRef)
  | null = null;

export function registerWorkspaceRefFactory(
  factory: (hubUrl: string, orgId: string, workspaceId: string) => WorkspaceScopedRef,
): void {
  workspaceRefFactory = factory;
}

// Forward-declared interface so WorkspaceScopedRef can reference it without importing workspace.ts
export interface EvoWorkspaceRef extends EvoResourceRef {
  readonly kind: 'workspace';
  readonly workspaceId: WorkspaceId;
}

export abstract class WorkspaceScopedRef extends EvoResourceRef {
  readonly workspaceId: WorkspaceId;

  protected constructor(hubUrl: string, orgId: string, workspaceId: string) {
    super(hubUrl, orgId);
    this.workspaceId = parseWorkspaceId(workspaceId);
  }

  toWorkspaceRef(): EvoWorkspaceRef {
    if (!workspaceRefFactory) {
      throw new Error(
        'No workspace ref factory registered. Ensure workspace.ts is imported before calling toWorkspaceRef().',
      );
    }
    return workspaceRefFactory(this.hubUrl, this.orgId, this.workspaceId) as EvoWorkspaceRef;
  }
}
