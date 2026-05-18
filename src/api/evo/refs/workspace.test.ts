import { describe, it, expect } from 'vitest';
import { EvoWorkspaceRef } from './workspace';

const HUB = 'https://au1.evo.seequent.com';
const ORG_ID = '3e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7';
const WS_ID = '5a6b7c8d-9e0f-4a1b-b2c3-d4e5f6a7b8c9';

describe('EvoWorkspaceRef.fromIds', () => {
  it('builds a ref with correct hubUrl, orgId, workspaceId', () => {
    const ref = EvoWorkspaceRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID });
    expect(ref.hubUrl).toBe(HUB);
    expect(ref.orgId).toBe(ORG_ID);
    expect(ref.workspaceId).toBe(WS_ID);
  });

  it('normalises trailing slash in hubUrl', () => {
    const ref = EvoWorkspaceRef.fromIds({ hubUrl: `${HUB}/`, orgId: ORG_ID, workspaceId: WS_ID });
    expect(ref.hubUrl).toBe(HUB);
  });

  it('throws on non-UUID orgId', () => {
    expect(() =>
      EvoWorkspaceRef.fromIds({ hubUrl: HUB, orgId: 'not-a-uuid', workspaceId: WS_ID }),
    ).toThrow();
  });

  it('throws on non-UUID workspaceId', () => {
    expect(() =>
      EvoWorkspaceRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: 'not-a-uuid' }),
    ).toThrow();
  });

  it('throws on http:// hubUrl', () => {
    expect(() =>
      EvoWorkspaceRef.fromIds({
        hubUrl: 'http://au1.evo.seequent.com',
        orgId: ORG_ID,
        workspaceId: WS_ID,
      }),
    ).toThrow('https://');
  });
});

describe('EvoWorkspaceRef.toUrl', () => {
  it('returns {hubUrl}/workspace/orgs/{orgId}/workspaces/{workspaceId}', () => {
    const ref = EvoWorkspaceRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID });
    expect(ref.toUrl()).toBe(
      `${HUB}/workspace/orgs/${ORG_ID}/workspaces/${WS_ID}`,
    );
  });
});

describe('EvoWorkspaceRef.fromUrl', () => {
  it('round-trips: fromUrl(ref.toUrl()).equals(ref)', () => {
    const ref = EvoWorkspaceRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID });
    expect(EvoWorkspaceRef.fromUrl(ref.toUrl()).equals(ref)).toBe(true);
  });

  it('parses a known URL correctly', () => {
    const url = `${HUB}/workspace/orgs/${ORG_ID}/workspaces/${WS_ID}`;
    const ref = EvoWorkspaceRef.fromUrl(url);
    expect(ref.hubUrl).toBe(HUB);
    expect(ref.orgId).toBe(ORG_ID);
    expect(ref.workspaceId).toBe(WS_ID);
  });

  it('throws on URL with wrong service segment', () => {
    const url = `${HUB}/file/orgs/${ORG_ID}/workspaces/${WS_ID}`;
    expect(() => EvoWorkspaceRef.fromUrl(url)).toThrow('workspace pattern');
  });

  it('throws on URL missing segments', () => {
    const url = `${HUB}/workspace/orgs/${ORG_ID}`;
    expect(() => EvoWorkspaceRef.fromUrl(url)).toThrow('workspace pattern');
  });
});

describe('EvoWorkspaceRef.equals', () => {
  it('two refs built from same ids are equal', () => {
    const a = EvoWorkspaceRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID });
    const b = EvoWorkspaceRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID });
    expect(a.equals(b)).toBe(true);
  });

  it('refs with different workspaceId are not equal', () => {
    const a = EvoWorkspaceRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID });
    const b = EvoWorkspaceRef.fromIds({
      hubUrl: HUB,
      orgId: ORG_ID,
      workspaceId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    });
    expect(a.equals(b)).toBe(false);
  });

  it('equals(null) returns false', () => {
    const ref = EvoWorkspaceRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID });
    expect(ref.equals(null)).toBe(false);
  });
});

describe('EvoWorkspaceRef.toWorkspaceRef', () => {
  it('returns itself (or equivalent with same values)', () => {
    const ref = EvoWorkspaceRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID });
    const ws = ref.toWorkspaceRef();
    expect(ws.hubUrl).toBe(ref.hubUrl);
    expect(ws.orgId).toBe(ref.orgId);
    expect(ws.workspaceId).toBe(ref.workspaceId);
  });
});
