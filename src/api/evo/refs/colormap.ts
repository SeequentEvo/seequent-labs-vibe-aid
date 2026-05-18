import { WorkspaceScopedRef } from './base';
import type { EvoWorkspaceRef } from './workspace';
import type { ColormapId } from '@/types/ids';
import { parseColormapId } from '@/types/ids';

export class EvoColormapRef extends WorkspaceScopedRef {
  readonly kind = 'colormap' as const;
  readonly colormapId: ColormapId;

  private constructor(hubUrl: string, orgId: string, workspaceId: string, colormapId: string) {
    super(hubUrl, orgId, workspaceId);
    this.colormapId = parseColormapId(colormapId);
  }

  static fromIds(args: {
    hubUrl: string;
    orgId: string;
    workspaceId: string;
    colormapId: string;
  }): EvoColormapRef {
    return new EvoColormapRef(args.hubUrl, args.orgId, args.workspaceId, args.colormapId);
  }

  static fromWorkspace(ws: EvoWorkspaceRef, args: { colormapId: string }): EvoColormapRef {
    return new EvoColormapRef(ws.hubUrl, ws.orgId, ws.workspaceId, args.colormapId);
  }

  static fromUrl(url: string): EvoColormapRef {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    // Expected: ['colormap', 'orgs', orgId, 'workspaces', workspaceId, 'colormaps', colormapId]
    const [seg0, seg1, orgId, seg3, workspaceId, seg5, colormapId] = segments;
    if (
      segments.length !== 7 ||
      seg0 !== 'colormap' ||
      seg1 !== 'orgs' ||
      seg3 !== 'workspaces' ||
      seg5 !== 'colormaps' ||
      !orgId ||
      !workspaceId ||
      !colormapId
    ) {
      throw new Error(
        `URL does not match colormap pattern "{hubUrl}/colormap/orgs/{orgId}/workspaces/{workspaceId}/colormaps/{colormapId}", got: ${JSON.stringify(url)}`,
      );
    }
    const hubUrl = `${parsed.protocol}//${parsed.host}`;
    return new EvoColormapRef(hubUrl, orgId, workspaceId, colormapId);
  }

  toUrl(): string {
    return `${this.hubUrl}/colormap/orgs/${this.orgId}/workspaces/${this.workspaceId}/colormaps/${this.colormapId}`;
  }

  equals(other: unknown): boolean {
    if (!(other instanceof EvoColormapRef)) return false;
    return (
      this.hubUrl === other.hubUrl &&
      this.orgId === other.orgId &&
      this.workspaceId === other.workspaceId &&
      this.colormapId === other.colormapId
    );
  }
}
