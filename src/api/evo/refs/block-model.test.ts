import { describe, it, expect } from 'vitest';
import { EvoBlockModelRef } from './block-model';
import { EvoWorkspaceRef } from './workspace';

const HUB = 'https://au1.evo.seequent.com';
const ORG_ID = '3e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7';
const WS_ID = '5a6b7c8d-9e0f-4a1b-b2c3-d4e5f6a7b8c9';
const BM_ID = 'b0c1d2e3-f4a5-4b6c-8c7d-e8f9a0b1c2d3';
// CRITICAL: version is a UUID (sourced from version_uuid response field, NOT integer version_id)
const VERSION_UUID = 'a1b2c3d4-e5f6-4a7b-9c8d-e0f1a2b3c4d5';
const BAD_VERSION_INT = '42'; // this is what API's version_id looks like — must be rejected

describe('EvoBlockModelRef.fromIds (no version)', () => {
  it('builds a ref with correct bmId, versionId === null, isVersioned === false', () => {
    const ref = EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: BM_ID });
    expect(ref.bmId).toBe(BM_ID);
    expect(ref.versionId).toBeNull();
    expect(ref.isVersioned).toBe(false);
  });

  it('throws on non-UUID bmId', () => {
    expect(() =>
      EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: 'not-a-uuid' }),
    ).toThrow();
  });
});

describe('EvoBlockModelRef.fromIds (with version)', () => {
  it('sets versionId === VERSION_UUID and isVersioned === true', () => {
    const ref = EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: BM_ID, versionId: VERSION_UUID });
    expect(ref.versionId).toBe(VERSION_UUID);
    expect(ref.isVersioned).toBe(true);
  });

  it('accepts opaque version_id (no longer UUID-validated)', () => {
    // version_uuid is documented as opaque — any non-empty string is valid.
    const ref = EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: BM_ID, versionId: BAD_VERSION_INT });
    expect(ref.versionId).toBe(BAD_VERSION_INT);
  });
});

describe('EvoBlockModelRef.fromWorkspace', () => {
  it('produces the same result as fromIds with equivalent args', () => {
    const ws = EvoWorkspaceRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID });

    const fromWs = EvoBlockModelRef.fromWorkspace(ws, { bmId: BM_ID, versionId: VERSION_UUID });
    const fromIds = EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: BM_ID, versionId: VERSION_UUID });

    expect(fromWs.equals(fromIds)).toBe(true);
  });

  it('produces the same result as fromIds without version', () => {
    const ws = EvoWorkspaceRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID });

    const fromWs = EvoBlockModelRef.fromWorkspace(ws, { bmId: BM_ID });
    const fromIds = EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: BM_ID });

    expect(fromWs.equals(fromIds)).toBe(true);
  });
});

describe('EvoBlockModelRef.toUrl', () => {
  it('returns the correct URL without version', () => {
    const ref = EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: BM_ID });
    expect(ref.toUrl()).toBe(
      `${HUB}/blockmodel/orgs/${ORG_ID}/workspaces/${WS_ID}/block-models/${BM_ID}`,
    );
  });

  it('appends version to the path — not as a query param', () => {
    const ref = EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: BM_ID, versionId: VERSION_UUID });
    expect(ref.toUrl()).toBe(
      `${HUB}/blockmodel/orgs/${ORG_ID}/workspaces/${WS_ID}/block-models/${BM_ID}/versions/${VERSION_UUID}`,
    );
    expect(ref.toUrl()).not.toContain('?');
  });
});

describe('EvoBlockModelRef.fromUrl round-trips', () => {
  it('unversioned: fromUrl(ref.toUrl()).equals(ref)', () => {
    const ref = EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: BM_ID });
    expect(EvoBlockModelRef.fromUrl(ref.toUrl()).equals(ref)).toBe(true);
  });

  it('versioned: round-trip preserves versionId', () => {
    const ref = EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: BM_ID, versionId: VERSION_UUID });
    const roundTripped = EvoBlockModelRef.fromUrl(ref.toUrl());
    expect(roundTripped.equals(ref)).toBe(true);
    expect(roundTripped.versionId).toBe(VERSION_UUID);
  });
});

describe('EvoBlockModelRef.fromUrl error cases', () => {
  it('throws on wrong service segment', () => {
    const url = `${HUB}/file/orgs/${ORG_ID}/workspaces/${WS_ID}/block-models/${BM_ID}`;
    expect(() => EvoBlockModelRef.fromUrl(url)).toThrow('block model pattern');
  });

  it('accepts opaque versionId in URL (no longer UUID-validated)', () => {
    const url = `${HUB}/blockmodel/orgs/${ORG_ID}/workspaces/${WS_ID}/block-models/${BM_ID}/versions/not-a-uuid`;
    const ref = EvoBlockModelRef.fromUrl(url);
    expect(ref.versionId).toBe('not-a-uuid');
  });
});

describe('EvoBlockModelRef.withVersion / withoutVersion', () => {
  it('withVersion returns new instance with versionId set', () => {
    const ref = EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: BM_ID });
    const versioned = ref.withVersion(VERSION_UUID);
    expect(versioned.versionId).toBe(VERSION_UUID);
    expect(versioned.isVersioned).toBe(true);
  });

  it('original ref is unchanged after withVersion (immutability)', () => {
    const ref = EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: BM_ID });
    ref.withVersion(VERSION_UUID);
    expect(ref.versionId).toBeNull();
    expect(ref.isVersioned).toBe(false);
  });

  it('withoutVersion returns ref with versionId === null', () => {
    const ref = EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: BM_ID, versionId: VERSION_UUID });
    const unversioned = ref.withoutVersion();
    expect(unversioned.versionId).toBeNull();
    expect(unversioned.isVersioned).toBe(false);
  });

  it('withVersion accepts opaque version_id (no longer UUID-validated)', () => {
    const ref = EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: BM_ID });
    const versioned = ref.withVersion(BAD_VERSION_INT);
    expect(versioned.versionId).toBe(BAD_VERSION_INT);
  });
});

describe('EvoBlockModelRef.equals', () => {
  it('same args (including same versionId) → equal', () => {
    const a = EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: BM_ID, versionId: VERSION_UUID });
    const b = EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: BM_ID, versionId: VERSION_UUID });
    expect(a.equals(b)).toBe(true);
  });

  it('one versioned, one not → not equal', () => {
    const a = EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: BM_ID, versionId: VERSION_UUID });
    const b = EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: BM_ID });
    expect(a.equals(b)).toBe(false);
  });

  it('different versionId UUIDs → not equal', () => {
    const a = EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: BM_ID, versionId: VERSION_UUID });
    const b = EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: BM_ID, versionId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' });
    expect(a.equals(b)).toBe(false);
  });

  it('equals(null) → false', () => {
    const ref = EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: BM_ID });
    expect(ref.equals(null)).toBe(false);
  });
});

describe('EvoBlockModelRef — opaque versionId round-trip', () => {
  const OPAQUE_VERSION = 'v1.0.0-opaque-handle';

  it('does NOT throw when constructing with a non-UUID versionId', () => {
    expect(() =>
      EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: BM_ID, versionId: OPAQUE_VERSION }),
    ).not.toThrow();
  });

  it('ref.versionId equals the opaque input', () => {
    const ref = EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: BM_ID, versionId: OPAQUE_VERSION });
    expect(ref.versionId).toBe(OPAQUE_VERSION);
  });

  it('round-trips through toUrl → fromUrl with opaque version preserved', () => {
    const ref = EvoBlockModelRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, bmId: BM_ID, versionId: OPAQUE_VERSION });
    const url = ref.toUrl();
    const roundTripped = EvoBlockModelRef.fromUrl(url);
    expect(roundTripped.versionId).toBe(OPAQUE_VERSION);
    expect(roundTripped.equals(ref)).toBe(true);
  });
});
