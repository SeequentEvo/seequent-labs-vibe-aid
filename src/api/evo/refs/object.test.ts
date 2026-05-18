import { describe, it, expect } from 'vitest';
import { EvoObjectRef } from './object';
import { EvoWorkspaceRef } from './workspace';

const HUB = 'https://au1.evo.seequent.com';
const ORG_ID = '3e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7';
const WS_ID = '5a6b7c8d-9e0f-4a1b-b2c3-d4e5f6a7b8c9';
const OBJ_ID = '9e0f1a2b-3c4d-4e5f-b6a7-b8c9d0e1f2a3';
const VERSION_ID = '2024-01-15T10:30:00.000Z'; // opaque timestamp, NOT a UUID

describe('EvoObjectRef.fromIds', () => {
  it('builds ref with correct properties, objectId set, objectPath null, versionId null', () => {
    const ref = EvoObjectRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, objectId: OBJ_ID });
    expect(ref.hubUrl).toBe(HUB);
    expect(ref.orgId).toBe(ORG_ID);
    expect(ref.workspaceId).toBe(WS_ID);
    expect(ref.objectId).toBe(OBJ_ID);
    expect(ref.objectPath).toBeNull();
    expect(ref.versionId).toBeNull();
    expect(ref.isVersioned).toBe(false);
  });

  it('with versionId: isVersioned === true', () => {
    const ref = EvoObjectRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, objectId: OBJ_ID, versionId: VERSION_ID });
    expect(ref.versionId).toBe(VERSION_ID);
    expect(ref.isVersioned).toBe(true);
  });

  it('throws on non-UUID objectId', () => {
    expect(() =>
      EvoObjectRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, objectId: 'not-a-uuid' }),
    ).toThrow();
  });

  it('identifier.kind === "id"', () => {
    const ref = EvoObjectRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, objectId: OBJ_ID });
    expect(ref.identifier.kind).toBe('id');
    expect(ref.identifier.value).toBe(OBJ_ID);
  });
});

describe('EvoObjectRef.fromPath', () => {
  it('builds ref with objectPath set, objectId null', () => {
    const ref = EvoObjectRef.fromPath({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, objectPath: 'survey/model' });
    expect(ref.objectPath).toBe('survey/model');
    expect(ref.objectId).toBeNull();
  });

  it('identifier.kind === "path"', () => {
    const ref = EvoObjectRef.fromPath({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, objectPath: 'survey/model' });
    expect(ref.identifier.kind).toBe('path');
    expect(ref.identifier.value).toBe('survey/model');
  });
});

describe('EvoObjectRef.fromWorkspace', () => {
  it('produces same result as fromIds with equivalent args', () => {
    const ws = EvoWorkspaceRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID });
    const fromWs = EvoObjectRef.fromWorkspace(ws, { objectId: OBJ_ID });
    const fromIds = EvoObjectRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, objectId: OBJ_ID });
    expect(fromWs.equals(fromIds)).toBe(true);
  });
});

describe('EvoObjectRef.toUrl — UUID form', () => {
  it('returns {HUB}/geoscience-object/orgs/{ORG_ID}/workspaces/{WS_ID}/objects/{OBJ_ID}', () => {
    const ref = EvoObjectRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, objectId: OBJ_ID });
    expect(ref.toUrl()).toBe(
      `${HUB}/geoscience-object/orgs/${ORG_ID}/workspaces/${WS_ID}/objects/${OBJ_ID}`,
    );
  });

  it('with version: appends ?version={VERSION_ID} — NOTE: query param is "version", NOT "version_id"', () => {
    // versionId property maps to ?version= in URL, not ?version_id=
    const ref = EvoObjectRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, objectId: OBJ_ID, versionId: VERSION_ID });
    const url = ref.toUrl();
    expect(url).toContain('?version=');
    expect(url).not.toContain('version_id');
    expect(url).toBe(
      `${HUB}/geoscience-object/orgs/${ORG_ID}/workspaces/${WS_ID}/objects/${OBJ_ID}?version=${encodeURIComponent(VERSION_ID)}`,
    );
  });
});

describe('EvoObjectRef.toUrl — path form', () => {
  it('returns {HUB}/geoscience-object/orgs/{ORG_ID}/workspaces/{WS_ID}/objects/path/survey/model', () => {
    const ref = EvoObjectRef.fromPath({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, objectPath: 'survey/model' });
    expect(ref.toUrl()).toBe(
      `${HUB}/geoscience-object/orgs/${ORG_ID}/workspaces/${WS_ID}/objects/path/survey/model`,
    );
  });

  it('encodes special chars per-segment', () => {
    const ref = EvoObjectRef.fromPath({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, objectPath: 'survey/my model & data' });
    const url = ref.toUrl();
    expect(url).toContain('/path/survey/');
    expect(url).not.toContain(' ');
    expect(url).not.toContain('&');
  });
});

describe('EvoObjectRef.fromUrl round-trips', () => {
  it('UUID form', () => {
    const ref = EvoObjectRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, objectId: OBJ_ID });
    expect(EvoObjectRef.fromUrl(ref.toUrl()).equals(ref)).toBe(true);
  });

  it('UUID + version (preserves versionId)', () => {
    const ref = EvoObjectRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, objectId: OBJ_ID, versionId: VERSION_ID });
    const roundTripped = EvoObjectRef.fromUrl(ref.toUrl());
    expect(roundTripped.equals(ref)).toBe(true);
    expect(roundTripped.versionId).toBe(VERSION_ID);
  });

  it('path form', () => {
    const ref = EvoObjectRef.fromPath({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, objectPath: 'survey/model' });
    expect(EvoObjectRef.fromUrl(ref.toUrl()).equals(ref)).toBe(true);
  });
});

describe('EvoObjectRef.fromUrl — wrong service segment', () => {
  it('throws on /file/... URL', () => {
    const url = `${HUB}/file/orgs/${ORG_ID}/workspaces/${WS_ID}/objects/${OBJ_ID}`;
    expect(() => EvoObjectRef.fromUrl(url)).toThrow('geoscience-object pattern');
  });

  it('throws on /workspace/... URL', () => {
    const url = `${HUB}/workspace/orgs/${ORG_ID}/workspaces/${WS_ID}/objects/${OBJ_ID}`;
    expect(() => EvoObjectRef.fromUrl(url)).toThrow('geoscience-object pattern');
  });
});

describe('EvoObjectRef.withVersion / withoutVersion', () => {
  it('withVersion returns new instance, original unchanged', () => {
    const original = EvoObjectRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, objectId: OBJ_ID });
    const versioned = original.withVersion(VERSION_ID);
    expect(versioned.versionId).toBe(VERSION_ID);
    expect(versioned.isVersioned).toBe(true);
    expect(original.versionId).toBeNull();
    expect(versioned).not.toBe(original);
  });

  it('withoutVersion clears version', () => {
    const versioned = EvoObjectRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, objectId: OBJ_ID, versionId: VERSION_ID });
    const unversioned = versioned.withoutVersion();
    expect(unversioned.versionId).toBeNull();
    expect(unversioned.isVersioned).toBe(false);
  });
});

describe('EvoObjectRef.equals', () => {
  it('same args → equal', () => {
    const a = EvoObjectRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, objectId: OBJ_ID });
    const b = EvoObjectRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, objectId: OBJ_ID });
    expect(a.equals(b)).toBe(true);
  });

  it('different versionId → not equal', () => {
    const a = EvoObjectRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, objectId: OBJ_ID });
    const b = EvoObjectRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, objectId: OBJ_ID, versionId: VERSION_ID });
    expect(a.equals(b)).toBe(false);
  });

  it('equals(null) → false', () => {
    const ref = EvoObjectRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, objectId: OBJ_ID });
    expect(ref.equals(null)).toBe(false);
  });
});
