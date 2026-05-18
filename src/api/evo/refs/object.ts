import { WorkspaceScopedRef, encodeResourcePath } from './base';
import type { EvoWorkspaceRef } from './workspace';
import type { ObjectId, ObjectPath, VersionId } from '@/types/ids';
import { parseObjectId, parseObjectPath, parseVersionId, tryParseVersionId } from '@/types/ids';

export class EvoObjectRef extends WorkspaceScopedRef {
  readonly kind = 'object' as const;
  readonly objectId: ObjectId | null;
  readonly objectPath: ObjectPath | null;
  readonly versionId: VersionId | null;
  readonly isVersioned: boolean;
  readonly identifier: { kind: 'id'; value: ObjectId } | { kind: 'path'; value: ObjectPath };

  private constructor(
    hubUrl: string,
    orgId: string,
    workspaceId: string,
    objectId: ObjectId | null,
    objectPath: ObjectPath | null,
    versionId: VersionId | null,
  ) {
    super(hubUrl, orgId, workspaceId);
    this.objectId = objectId;
    this.objectPath = objectPath;
    this.versionId = versionId;
    this.isVersioned = versionId !== null;
    this.identifier =
      objectId !== null
        ? { kind: 'id', value: objectId }
        : { kind: 'path', value: objectPath! };
  }

  static fromIds(args: {
    hubUrl: string;
    orgId: string;
    workspaceId: string;
    objectId: string;
    versionId?: string;
  }): EvoObjectRef {
    const objectId = parseObjectId(args.objectId);
    return new EvoObjectRef(
      args.hubUrl,
      args.orgId,
      args.workspaceId,
      objectId,
      null,
      args.versionId ? parseVersionId(args.versionId) : null,
    );
  }

  static fromPath(args: {
    hubUrl: string;
    orgId: string;
    workspaceId: string;
    objectPath: string;
    versionId?: string;
  }): EvoObjectRef {
    return new EvoObjectRef(
      args.hubUrl,
      args.orgId,
      args.workspaceId,
      null,
      parseObjectPath(args.objectPath),
      args.versionId ? parseVersionId(args.versionId) : null,
    );
  }

  static fromWorkspace(
    ws: EvoWorkspaceRef,
    args: { objectId: string; versionId?: string } | { objectPath: string; versionId?: string },
  ): EvoObjectRef {
    if ('objectId' in args) {
      return EvoObjectRef.fromIds({
        hubUrl: ws.hubUrl,
        orgId: ws.orgId,
        workspaceId: ws.workspaceId,
        objectId: args.objectId,
        versionId: args.versionId,
      });
    }
    return EvoObjectRef.fromPath({
      hubUrl: ws.hubUrl,
      orgId: ws.orgId,
      workspaceId: ws.workspaceId,
      objectPath: args.objectPath,
      versionId: args.versionId,
    });
  }

  static fromUrl(url: string): EvoObjectRef {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    // Expected: ['geoscience-object', 'orgs', orgId, 'workspaces', workspaceId, 'objects', ...]
    const [seg0, seg1, orgId, seg3, workspaceId, seg5, ...rest] = segments;
    if (
      seg0 !== 'geoscience-object' ||
      seg1 !== 'orgs' ||
      !orgId ||
      seg3 !== 'workspaces' ||
      !workspaceId ||
      seg5 !== 'objects' ||
      rest.length === 0
    ) {
      throw new Error(
        `URL does not match geoscience-object pattern "{hubUrl}/geoscience-object/orgs/{orgId}/workspaces/{workspaceId}/objects/...", got: ${JSON.stringify(url)}`,
      );
    }
    const hubUrl = `${parsed.protocol}//${parsed.host}`;
    const versionId = tryParseVersionId(parsed.searchParams.get('version'));

    const firstSegment = rest[0] as string;

    if (firstSegment === 'path') {
      const objectPath = parseObjectPath(rest.slice(1).map(decodeURIComponent).join('/'));
      return new EvoObjectRef(hubUrl, orgId, workspaceId, null, objectPath, versionId);
    }

    const objectId = parseObjectId(firstSegment);
    return new EvoObjectRef(hubUrl, orgId, workspaceId, objectId, null, versionId);
  }

  withVersion(versionId: string): EvoObjectRef {
    return new EvoObjectRef(
      this.hubUrl,
      this.orgId,
      this.workspaceId,
      this.objectId,
      this.objectPath,
      parseVersionId(versionId),
    );
  }

  withoutVersion(): EvoObjectRef {
    return new EvoObjectRef(
      this.hubUrl,
      this.orgId,
      this.workspaceId,
      this.objectId,
      this.objectPath,
      null,
    );
  }

  toUrl(): string {
    const base = `${this.hubUrl}/geoscience-object/orgs/${this.orgId}/workspaces/${this.workspaceId}/objects`;
    let url: string;
    if (this.objectPath !== null) {
      url = `${base}/path/${encodeResourcePath(this.objectPath)}`;
    } else {
      url = `${base}/${this.objectId}`;
    }
    if (this.versionId !== null) {
      url += `?version=${encodeURIComponent(this.versionId)}`;
    }
    return url;
  }

  equals(other: unknown): boolean {
    if (!(other instanceof EvoObjectRef)) return false;
    return (
      this.hubUrl === other.hubUrl &&
      this.orgId === other.orgId &&
      this.workspaceId === other.workspaceId &&
      this.objectId === other.objectId &&
      this.objectPath === other.objectPath &&
      this.versionId === other.versionId
    );
  }
}
