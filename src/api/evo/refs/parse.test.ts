import { describe, it, expect } from 'vitest';
import { parseEvoUrl, tryParseEvoUrl } from './parse';
import { EvoWorkspaceRef } from './workspace';
import { EvoFileRef } from './file';
import { EvoObjectRef } from './object';
import { EvoBlockModelRef } from './block-model';
import { EvoColormapRef } from './colormap';

const HUB = 'https://au1.evo.seequent.com';
const ORG = '3e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7';
const WS  = '5a6b7c8d-9e0f-4a1b-b2c3-d4e5f6a7b8c9';
const FILE_ID = '7c8d9e0f-1a2b-4c3d-a4e5-f6a7b8c9d0e1';
const OBJ_ID  = '9e0f1a2b-3c4d-4e5f-b6a7-b8c9d0e1f2a3';
const BM_ID   = 'b0c1d2e3-f4a5-4b6c-8c7d-e8f9a0b1c2d3';
const CM_ID   = 'c1d2e3f4-a5b6-4c7d-9d8e-f0a1b2c3d4e5';
const BM_VER  = 'a1b2c3d4-e5f6-4a7b-9c8d-e0f1a2b3c4d5';

describe('parseEvoUrl — routing', () => {
  it('workspace URL → EvoWorkspaceRef', () => {
    const url = `${HUB}/workspace/orgs/${ORG}/workspaces/${WS}`;
    const ref = parseEvoUrl(url);
    expect(ref.kind).toBe('workspace');
    expect(ref).toBeInstanceOf(EvoWorkspaceRef);
  });

  it('file URL → EvoFileRef', () => {
    const url = `${HUB}/file/v2/orgs/${ORG}/workspaces/${WS}/files/${FILE_ID}`;
    const ref = parseEvoUrl(url);
    expect(ref.kind).toBe('file');
    expect(ref).toBeInstanceOf(EvoFileRef);
  });

  it('geoscience-object URL → EvoObjectRef', () => {
    const url = `${HUB}/geoscience-object/orgs/${ORG}/workspaces/${WS}/objects/${OBJ_ID}`;
    const ref = parseEvoUrl(url);
    expect(ref.kind).toBe('object');
    expect(ref).toBeInstanceOf(EvoObjectRef);
  });

  it('block model URL (unversioned) → EvoBlockModelRef with isVersioned === false', () => {
    const url = `${HUB}/blockmodel/orgs/${ORG}/workspaces/${WS}/block-models/${BM_ID}`;
    const ref = parseEvoUrl(url);
    expect(ref.kind).toBe('block-model');
    expect(ref).toBeInstanceOf(EvoBlockModelRef);
    expect((ref as EvoBlockModelRef).isVersioned).toBe(false);
  });

  it('block model URL (versioned /versions/{uuid}) → EvoBlockModelRef with isVersioned === true', () => {
    const url = `${HUB}/blockmodel/orgs/${ORG}/workspaces/${WS}/block-models/${BM_ID}/versions/${BM_VER}`;
    const ref = parseEvoUrl(url);
    expect(ref.kind).toBe('block-model');
    expect(ref).toBeInstanceOf(EvoBlockModelRef);
    expect((ref as EvoBlockModelRef).isVersioned).toBe(true);
    expect((ref as EvoBlockModelRef).versionId).toBe(BM_VER);
  });

  it('colormap URL → EvoColormapRef', () => {
    const url = `${HUB}/colormap/orgs/${ORG}/workspaces/${WS}/colormaps/${CM_ID}`;
    const ref = parseEvoUrl(url);
    expect(ref.kind).toBe('colormap');
    expect(ref).toBeInstanceOf(EvoColormapRef);
  });
});

describe('parseEvoUrl — round-trips', () => {
  it('workspace round-trip', () => {
    const wsRef = EvoWorkspaceRef.fromIds({ hubUrl: HUB, orgId: ORG, workspaceId: WS });
    expect(parseEvoUrl(wsRef.toUrl()).equals(wsRef)).toBe(true);
  });

  it('file round-trip', () => {
    const fileRef = EvoFileRef.fromIds({ hubUrl: HUB, orgId: ORG, workspaceId: WS, fileId: FILE_ID });
    expect(parseEvoUrl(fileRef.toUrl()).equals(fileRef)).toBe(true);
  });

  it('geoscience-object round-trip', () => {
    const objRef = EvoObjectRef.fromIds({ hubUrl: HUB, orgId: ORG, workspaceId: WS, objectId: OBJ_ID });
    expect(parseEvoUrl(objRef.toUrl()).equals(objRef)).toBe(true);
  });

  it('block model (versioned) round-trip', () => {
    const bmRef = EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG, workspaceId: WS, bmId: BM_ID, versionId: BM_VER });
    expect(parseEvoUrl(bmRef.toUrl()).equals(bmRef)).toBe(true);
  });

  it('colormap round-trip', () => {
    const cmRef = EvoColormapRef.fromIds({ hubUrl: HUB, orgId: ORG, workspaceId: WS, colormapId: CM_ID });
    expect(parseEvoUrl(cmRef.toUrl()).equals(cmRef)).toBe(true);
  });
});

describe('parseEvoUrl — errors', () => {
  it('throws on unrecognised service segment', () => {
    const url = `${HUB}/unknown-service/orgs/${ORG}/workspaces/${WS}`;
    expect(() => parseEvoUrl(url)).toThrow(/unrecognised.*unknown-service/i);
  });

  it('throws on completely malformed URL', () => {
    expect(() => parseEvoUrl('not a url')).toThrow(/malformed url/i);
  });
});

describe('tryParseEvoUrl', () => {
  it('returns correct ref for valid workspace URL', () => {
    const url = `${HUB}/workspace/orgs/${ORG}/workspaces/${WS}`;
    const ref = tryParseEvoUrl(url);
    expect(ref).not.toBeNull();
    expect(ref!.kind).toBe('workspace');
  });

  it('returns null for unrecognised service (no throw)', () => {
    const url = `${HUB}/unknown-service/orgs/${ORG}/workspaces/${WS}`;
    expect(tryParseEvoUrl(url)).toBeNull();
  });

  it('returns null for malformed URL (no throw)', () => {
    expect(tryParseEvoUrl('not a url')).toBeNull();
  });
});
