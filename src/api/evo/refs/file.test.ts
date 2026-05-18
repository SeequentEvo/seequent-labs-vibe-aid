import { describe, it, expect } from 'vitest';
import { EvoFileRef } from './file';
import { EvoWorkspaceRef } from './workspace';

const HUB = 'https://au1.evo.seequent.com';
const ORG_ID = '3e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7';
const WS_ID = '5a6b7c8d-9e0f-4a1b-b2c3-d4e5f6a7b8c9';
const FILE_ID = '7c8d9e0f-1a2b-4c3d-a4e5-f6a7b8c9d0e1';
const VERSION_ID = '42';

describe('EvoFileRef.fromIds', () => {
  it('builds ref with correct properties, fileId set, filePath null, versionId null', () => {
    const ref = EvoFileRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, fileId: FILE_ID });
    expect(ref.hubUrl).toBe(HUB);
    expect(ref.orgId).toBe(ORG_ID);
    expect(ref.workspaceId).toBe(WS_ID);
    expect(ref.fileId).toBe(FILE_ID);
    expect(ref.filePath).toBeNull();
    expect(ref.versionId).toBeNull();
    expect(ref.isVersioned).toBe(false);
  });

  it('with versionId: isVersioned === true, versionId === VERSION_ID', () => {
    const ref = EvoFileRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, fileId: FILE_ID, versionId: VERSION_ID });
    expect(ref.isVersioned).toBe(true);
    expect(ref.versionId).toBe(VERSION_ID);
  });

  it('throws on non-UUID fileId', () => {
    expect(() =>
      EvoFileRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, fileId: 'not-a-uuid' }),
    ).toThrow();
  });

  it('throws on non-UUID orgId', () => {
    expect(() =>
      EvoFileRef.fromIds({ hubUrl: HUB, orgId: 'not-a-uuid', workspaceId: WS_ID, fileId: FILE_ID }),
    ).toThrow();
  });

  it('identifier.kind === "id" and identifier.value === FILE_ID', () => {
    const ref = EvoFileRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, fileId: FILE_ID });
    expect(ref.identifier.kind).toBe('id');
    expect(ref.identifier.value).toBe(FILE_ID);
  });
});

describe('EvoFileRef.fromPath', () => {
  it('builds ref with filePath set, fileId null', () => {
    const ref = EvoFileRef.fromPath({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, filePath: 'folder/file.txt' });
    expect(ref.filePath).toBe('folder/file.txt');
    expect(ref.fileId).toBeNull();
  });

  it('identifier.kind === "path"', () => {
    const ref = EvoFileRef.fromPath({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, filePath: 'folder/file.txt' });
    expect(ref.identifier.kind).toBe('path');
  });
});

describe('EvoFileRef.fromWorkspace', () => {
  const ws = EvoWorkspaceRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID });

  it('produces same result as fromIds with equivalent args', () => {
    const fromWs = EvoFileRef.fromWorkspace(ws, { fileId: FILE_ID });
    const fromIds = EvoFileRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, fileId: FILE_ID });
    expect(fromWs.equals(fromIds)).toBe(true);
  });

  it('produces same result as fromPath with equivalent args', () => {
    const fromWs = EvoFileRef.fromWorkspace(ws, { filePath: 'folder/file.txt' });
    const fromPath = EvoFileRef.fromPath({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, filePath: 'folder/file.txt' });
    expect(fromWs.equals(fromPath)).toBe(true);
  });
});

describe('EvoFileRef.toUrl — UUID form', () => {
  it('returns {HUB}/file/v2/orgs/{ORG_ID}/workspaces/{WS_ID}/files/{FILE_ID}', () => {
    const ref = EvoFileRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, fileId: FILE_ID });
    expect(ref.toUrl()).toBe(`${HUB}/file/v2/orgs/${ORG_ID}/workspaces/${WS_ID}/files/${FILE_ID}`);
  });

  it('with version appends ?version_id=42', () => {
    const ref = EvoFileRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, fileId: FILE_ID, versionId: VERSION_ID });
    expect(ref.toUrl()).toBe(`${HUB}/file/v2/orgs/${ORG_ID}/workspaces/${WS_ID}/files/${FILE_ID}?version_id=42`);
  });
});

describe('EvoFileRef.toUrl — path form', () => {
  it('encodes path segments in URL', () => {
    const ref = EvoFileRef.fromPath({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, filePath: 'folder/file.txt' });
    expect(ref.toUrl()).toBe(`${HUB}/file/v2/orgs/${ORG_ID}/workspaces/${WS_ID}/files/path/folder/file.txt`);
  });

  it('encodes spaces in each segment separately', () => {
    const ref = EvoFileRef.fromPath({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, filePath: 'my file/report.txt' });
    expect(ref.toUrl()).toBe(`${HUB}/file/v2/orgs/${ORG_ID}/workspaces/${WS_ID}/files/path/my%20file/report.txt`);
  });
});

describe('EvoFileRef.fromUrl round-trips', () => {
  it('UUID form: fromUrl(ref.toUrl()).equals(ref)', () => {
    const ref = EvoFileRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, fileId: FILE_ID });
    expect(EvoFileRef.fromUrl(ref.toUrl()).equals(ref)).toBe(true);
  });

  it('UUID + version: round-trip preserves versionId', () => {
    const ref = EvoFileRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, fileId: FILE_ID, versionId: VERSION_ID });
    const roundTripped = EvoFileRef.fromUrl(ref.toUrl());
    expect(roundTripped.equals(ref)).toBe(true);
    expect(roundTripped.versionId).toBe(VERSION_ID);
  });

  it('path form: round-trip preserves filePath', () => {
    const ref = EvoFileRef.fromPath({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, filePath: 'folder/file.txt' });
    const roundTripped = EvoFileRef.fromUrl(ref.toUrl());
    expect(roundTripped.equals(ref)).toBe(true);
    expect(roundTripped.filePath).toBe('folder/file.txt');
  });

  it('path with special chars: round-trip preserves original path value', () => {
    const ref = EvoFileRef.fromPath({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, filePath: 'my file/report.txt' });
    const roundTripped = EvoFileRef.fromUrl(ref.toUrl());
    expect(roundTripped.equals(ref)).toBe(true);
    expect(roundTripped.filePath).toBe('my file/report.txt');
  });
});

describe('EvoFileRef.fromUrl error cases', () => {
  it('throws on wrong service segment', () => {
    const url = `${HUB}/workspace/v2/orgs/${ORG_ID}/workspaces/${WS_ID}/files/${FILE_ID}`;
    expect(() => EvoFileRef.fromUrl(url)).toThrow('file pattern');
  });

  it('throws on missing required segments', () => {
    const url = `${HUB}/file/v2/orgs/${ORG_ID}/workspaces/${WS_ID}`;
    expect(() => EvoFileRef.fromUrl(url)).toThrow('file pattern');
  });
});

describe('EvoFileRef.withVersion / withoutVersion', () => {
  it('withVersion returns new instance, original unchanged', () => {
    const original = EvoFileRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, fileId: FILE_ID });
    const versioned = original.withVersion('99');
    expect(versioned.versionId).toBe('99');
    expect(original.versionId).toBeNull();
    expect(versioned).not.toBe(original);
  });

  it('withoutVersion on versioned ref returns unversioned ref', () => {
    const versioned = EvoFileRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, fileId: FILE_ID, versionId: VERSION_ID });
    const unversioned = versioned.withoutVersion();
    expect(unversioned.versionId).toBeNull();
    expect(unversioned.isVersioned).toBe(false);
  });

  it('withVersion then withoutVersion round-trips to unversioned equality', () => {
    const original = EvoFileRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, fileId: FILE_ID });
    const roundTripped = original.withVersion('99').withoutVersion();
    expect(roundTripped.equals(original)).toBe(true);
  });
});

describe('EvoFileRef.equals', () => {
  it('same args → equal', () => {
    const a = EvoFileRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, fileId: FILE_ID });
    const b = EvoFileRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, fileId: FILE_ID });
    expect(a.equals(b)).toBe(true);
  });

  it('different fileId → not equal', () => {
    const a = EvoFileRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, fileId: FILE_ID });
    const b = EvoFileRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, fileId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' });
    expect(a.equals(b)).toBe(false);
  });

  it('different versionId → not equal', () => {
    const a = EvoFileRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, fileId: FILE_ID, versionId: '1' });
    const b = EvoFileRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, fileId: FILE_ID, versionId: '2' });
    expect(a.equals(b)).toBe(false);
  });

  it('equals(null) → false', () => {
    const ref = EvoFileRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, fileId: FILE_ID });
    expect(ref.equals(null)).toBe(false);
  });
});

describe('EvoFileRef.fromUrl — non-UUID file ID rejection', () => {
  it('throws when the file ID segment is not a valid UUID', () => {
    const url = `${HUB}/file/v2/orgs/${ORG_ID}/workspaces/${WS_ID}/files/not-a-uuid-value`;
    expect(() => EvoFileRef.fromUrl(url)).toThrow();
  });
});
