import { EvoResourceRef, registerWorkspaceRefFactory } from './base';
import type { EvoRefKind, WorkspaceScopedRef } from './base';
import type { WorkspaceId } from '@/types/ids';
import { parseWorkspaceId } from '@/types/ids';

export class EvoWorkspaceRef extends EvoResourceRef {
  readonly kind: EvoRefKind = 'workspace' as const;
  readonly workspaceId: WorkspaceId;

  private constructor(hubUrl: string, orgId: string, workspaceId: string) {
    super(hubUrl, orgId);
    this.workspaceId = parseWorkspaceId(workspaceId);
  }

  static fromIds(args: { hubUrl: string; orgId: string; workspaceId: string }): EvoWorkspaceRef {
    return new EvoWorkspaceRef(args.hubUrl, args.orgId, args.workspaceId);
  }

  static fromUrl(url: string): EvoWorkspaceRef {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    // Expected: ['workspace', 'orgs', orgId, 'workspaces', workspaceId]
    const [seg0, seg1, orgId, seg3, workspaceId] = segments;
    if (
      segments.length !== 5 ||
      seg0 !== 'workspace' ||
      seg1 !== 'orgs' ||
      seg3 !== 'workspaces' ||
      !orgId ||
      !workspaceId
    ) {
      throw new Error(
        `URL does not match workspace pattern "{hubUrl}/workspace/orgs/{orgId}/workspaces/{workspaceId}", got: ${JSON.stringify(url)}`,
      );
    }
    const hubUrl = `${parsed.protocol}//${parsed.host}`;
    return new EvoWorkspaceRef(hubUrl, orgId, workspaceId);
  }

  toUrl(): string {
    return `${this.hubUrl}/workspace/orgs/${this.orgId}/workspaces/${this.workspaceId}`;
  }

  /** Returns itself — satisfies the WorkspaceScopedRef interface used by the factory registry. */
  toWorkspaceRef(): this {
    return this;
  }

  equals(other: unknown): boolean {
    if (!(other instanceof EvoWorkspaceRef)) return false;
    return (
      this.hubUrl === other.hubUrl &&
      this.orgId === other.orgId &&
      this.workspaceId === other.workspaceId
    );
  }
}

registerWorkspaceRefFactory(
  (hubUrl, orgId, workspaceId) =>
    EvoWorkspaceRef.fromIds({ hubUrl, orgId, workspaceId }) as unknown as WorkspaceScopedRef,
);
