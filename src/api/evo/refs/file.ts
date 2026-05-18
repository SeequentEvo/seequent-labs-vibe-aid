import { WorkspaceScopedRef, encodeResourcePath, decodeResourcePath } from './base';
import type { EvoWorkspaceRef } from './workspace';
import type { FileId, FilePath, VersionId } from '@/types/ids';
import { parseFileId, parseFilePath, parseVersionId, tryParseVersionId } from '@/types/ids';

type FileIdentifier =
  | { kind: 'id'; value: FileId }
  | { kind: 'path'; value: FilePath };

export class EvoFileRef extends WorkspaceScopedRef {
  readonly kind = 'file' as const;
  readonly fileId: FileId | null;
  readonly filePath: FilePath | null;
  readonly versionId: VersionId | null;
  readonly isVersioned: boolean;
  readonly identifier: FileIdentifier;

  private constructor(
    hubUrl: string,
    orgId: string,
    workspaceId: string,
    identifier: FileIdentifier,
    versionId: string | null,
  ) {
    super(hubUrl, orgId, workspaceId);
    this.identifier = identifier;
    this.versionId = versionId !== null ? parseVersionId(versionId) : null;
    this.isVersioned = versionId !== null;

    if (identifier.kind === 'id') {
      this.fileId = identifier.value;
      this.filePath = null;
    } else {
      this.fileId = null;
      this.filePath = identifier.value;
    }
  }

  static fromIds(args: {
    hubUrl: string;
    orgId: string;
    workspaceId: string;
    fileId: string;
    versionId?: string;
  }): EvoFileRef {
    const fileId = parseFileId(args.fileId);
    return new EvoFileRef(
      args.hubUrl,
      args.orgId,
      args.workspaceId,
      { kind: 'id', value: fileId },
      args.versionId ? parseVersionId(args.versionId) : null,
    );
  }

  static fromPath(args: {
    hubUrl: string;
    orgId: string;
    workspaceId: string;
    filePath: string;
    versionId?: string;
  }): EvoFileRef {
    return new EvoFileRef(
      args.hubUrl,
      args.orgId,
      args.workspaceId,
      { kind: 'path', value: parseFilePath(args.filePath) },
      args.versionId ? parseVersionId(args.versionId) : null,
    );
  }

  static fromWorkspace(
    ws: EvoWorkspaceRef,
    args: { fileId: string; versionId?: string } | { filePath: string; versionId?: string },
  ): EvoFileRef {
    if ('fileId' in args && 'filePath' in args) {
      throw new Error('Cannot supply both fileId and filePath');
    }
    if ('fileId' in args) {
      return EvoFileRef.fromIds({
        hubUrl: ws.hubUrl,
        orgId: ws.orgId,
        workspaceId: ws.workspaceId,
        fileId: args.fileId,
        versionId: args.versionId,
      });
    }
    return EvoFileRef.fromPath({
      hubUrl: ws.hubUrl,
      orgId: ws.orgId,
      workspaceId: ws.workspaceId,
      filePath: args.filePath,
      versionId: args.versionId,
    });
  }

  static fromUrl(url: string): EvoFileRef {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    // Expected prefix: ['file', 'v2', 'orgs', orgId, 'workspaces', workspaceId, 'files', ...]
    const [seg0, seg1, seg2, orgId, seg4, workspaceId, seg6, ...rest] = segments;
    if (
      seg0 !== 'file' ||
      seg1 !== 'v2' ||
      seg2 !== 'orgs' ||
      !orgId ||
      seg4 !== 'workspaces' ||
      !workspaceId ||
      seg6 !== 'files' ||
      rest.length === 0
    ) {
      throw new Error(
        `URL does not match file pattern "{hubUrl}/file/v2/orgs/{orgId}/workspaces/{workspaceId}/files/...", got: ${JSON.stringify(url)}`,
      );
    }

    const hubUrl = `${parsed.protocol}//${parsed.host}`;
    const versionId = tryParseVersionId(parsed.searchParams.get('version_id'));

    if (rest[0] === 'path') {
      const pathSegments = rest.slice(1);
      if (pathSegments.length === 0) {
        throw new Error(`URL is missing file path after 'path', got: ${JSON.stringify(url)}`);
      }
      const filePath = parseFilePath(decodeResourcePath(pathSegments.join('/')));
      return new EvoFileRef(hubUrl, orgId, workspaceId, { kind: 'path', value: filePath }, versionId);
    }

    const fileId = parseFileId(decodeURIComponent(rest[0] as string));
    return new EvoFileRef(hubUrl, orgId, workspaceId, { kind: 'id', value: fileId }, versionId);
  }

  withVersion(versionId: string): EvoFileRef {
    return new EvoFileRef(this.hubUrl, this.orgId, this.workspaceId, this.identifier, parseVersionId(versionId));
  }

  withoutVersion(): EvoFileRef {
    return new EvoFileRef(this.hubUrl, this.orgId, this.workspaceId, this.identifier, null);
  }

  toUrl(): string {
    const base = `${this.hubUrl}/file/v2/orgs/${this.orgId}/workspaces/${this.workspaceId}/files`;
    let path: string;
    if (this.identifier.kind === 'id') {
      path = `${base}/${this.identifier.value}`;
    } else {
      path = `${base}/path/${encodeResourcePath(this.identifier.value)}`;
    }
    if (this.versionId !== null) {
      path += `?version_id=${encodeURIComponent(this.versionId)}`;
    }
    return path;
  }

  equals(other: unknown): boolean {
    if (!(other instanceof EvoFileRef)) return false;
    if (
      this.hubUrl !== other.hubUrl ||
      this.orgId !== other.orgId ||
      this.workspaceId !== other.workspaceId ||
      this.versionId !== other.versionId
    ) {
      return false;
    }
    if (this.identifier.kind !== other.identifier.kind) return false;
    return this.identifier.value === other.identifier.value;
  }
}
