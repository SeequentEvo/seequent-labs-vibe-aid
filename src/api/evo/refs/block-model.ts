import { WorkspaceScopedRef } from './base';
import type { EvoWorkspaceRef } from './workspace';
import type { BlockModelId, VersionId } from '@/types/ids';
import { parseBlockModelId, parseVersionId } from '@/types/ids';

export class EvoBlockModelRef extends WorkspaceScopedRef {
  readonly kind = 'block-model' as const;
  readonly bmId: BlockModelId;
  readonly versionId: VersionId | null;
  readonly isVersioned: boolean;

  private constructor(
    hubUrl: string,
    orgId: string,
    workspaceId: string,
    bmId: string,
    versionId: string | null,
  ) {
    super(hubUrl, orgId, workspaceId);
    this.bmId = parseBlockModelId(bmId);
    this.versionId = versionId !== null ? parseVersionId(versionId) : null;
    this.isVersioned = versionId !== null;
  }

  static fromIds(args: {
    hubUrl: string;
    orgId: string;
    workspaceId: string;
    bmId: string;
    versionId?: string;
  }): EvoBlockModelRef {
    return new EvoBlockModelRef(
      args.hubUrl,
      args.orgId,
      args.workspaceId,
      args.bmId,
      args.versionId ?? null,
    );
  }

  static fromWorkspace(
    ws: EvoWorkspaceRef,
    args: { bmId: string; versionId?: string },
  ): EvoBlockModelRef {
    return new EvoBlockModelRef(
      ws.hubUrl,
      ws.orgId,
      ws.workspaceId,
      args.bmId,
      args.versionId ?? null,
    );
  }

  static fromUrl(url: string): EvoBlockModelRef {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    // Expected: ['blockmodel', 'orgs', orgId, 'workspaces', workspaceId, 'block-models', bmId, ...]
    const [seg0, seg1, orgId, seg3, workspaceId, seg5, bmId, seg7, versionId] = segments;
    if (
      seg0 !== 'blockmodel' ||
      seg1 !== 'orgs' ||
      !orgId ||
      seg3 !== 'workspaces' ||
      !workspaceId ||
      seg5 !== 'block-models' ||
      !bmId
    ) {
      throw new Error(
        `URL does not match block model pattern "{hubUrl}/blockmodel/orgs/{orgId}/workspaces/{workspaceId}/block-models/{bmId}[/versions/{versionId}]", got: ${JSON.stringify(url)}`,
      );
    }
    let resolvedVersionId: string | null = null;
    if (seg7 === 'versions') {
      if (!versionId) {
        throw new Error(
          `URL has 'versions' segment but no versionId, got: ${JSON.stringify(url)}`,
        );
      }
      resolvedVersionId = versionId;
    }

    const hubUrl = `${parsed.protocol}//${parsed.host}`;
    return new EvoBlockModelRef(hubUrl, orgId, workspaceId, bmId, resolvedVersionId);
  }

  toUrl(): string {
    const base = `${this.hubUrl}/blockmodel/orgs/${this.orgId}/workspaces/${this.workspaceId}/block-models/${this.bmId}`;
    if (this.versionId !== null) {
      return `${base}/versions/${this.versionId}`;
    }
    return base;
  }

  withVersion(versionId: string): EvoBlockModelRef {
    return new EvoBlockModelRef(
      this.hubUrl,
      this.orgId,
      this.workspaceId,
      this.bmId,
      versionId,
    );
  }

  withoutVersion(): EvoBlockModelRef {
    return new EvoBlockModelRef(
      this.hubUrl,
      this.orgId,
      this.workspaceId,
      this.bmId,
      null,
    );
  }

  equals(other: unknown): boolean {
    if (!(other instanceof EvoBlockModelRef)) return false;
    return (
      this.hubUrl === other.hubUrl &&
      this.orgId === other.orgId &&
      this.workspaceId === other.workspaceId &&
      this.bmId === other.bmId &&
      this.versionId === other.versionId
    );
  }
}
