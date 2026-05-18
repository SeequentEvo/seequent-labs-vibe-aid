import { describe, it, expect } from 'vitest';
import { EvoColormapRef } from './colormap';
import { EvoWorkspaceRef } from './workspace';

const HUB = 'https://au1.evo.seequent.com';
const ORG_ID = '3e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7';
const WS_ID = '5a6b7c8d-9e0f-4a1b-b2c3-d4e5f6a7b8c9';
const CM_ID = 'c1d2e3f4-a5b6-4c7d-9d8e-f0a1b2c3d4e5';

describe('EvoColormapRef', () => {
  describe('fromIds', () => {
    it('sets colormapId and kind correctly', () => {
      const ref = EvoColormapRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, colormapId: CM_ID });
      expect(ref.colormapId).toBe(CM_ID);
      expect(ref.kind).toBe('colormap');
    });

    it('throws on non-UUID colormapId', () => {
      expect(() =>
        EvoColormapRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, colormapId: 'not-a-uuid' }),
      ).toThrow();
    });

    it('throws on non-UUID orgId', () => {
      expect(() =>
        EvoColormapRef.fromIds({ hubUrl: HUB, orgId: 'bad-org', workspaceId: WS_ID, colormapId: CM_ID }),
      ).toThrow();
    });
  });

  describe('fromWorkspace', () => {
    it('produces the same result as fromIds with equivalent args', () => {
      const ws = EvoWorkspaceRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID });
      const fromWs = EvoColormapRef.fromWorkspace(ws, { colormapId: CM_ID });
      const fromIds = EvoColormapRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, colormapId: CM_ID });
      expect(fromWs.equals(fromIds)).toBe(true);
    });
  });

  describe('toUrl', () => {
    it('produces the expected URL', () => {
      const ref = EvoColormapRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, colormapId: CM_ID });
      expect(ref.toUrl()).toBe(
        `${HUB}/colormap/orgs/${ORG_ID}/workspaces/${WS_ID}/colormaps/${CM_ID}`,
      );
    });
  });

  describe('fromUrl', () => {
    it('round-trips through toUrl', () => {
      const ref = EvoColormapRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, colormapId: CM_ID });
      expect(EvoColormapRef.fromUrl(ref.toUrl()).equals(ref)).toBe(true);
    });

    it('parses a known URL correctly', () => {
      const url = `${HUB}/colormap/orgs/${ORG_ID}/workspaces/${WS_ID}/colormaps/${CM_ID}`;
      const ref = EvoColormapRef.fromUrl(url);
      expect(ref.hubUrl).toBe(HUB);
      expect(ref.orgId).toBe(ORG_ID);
      expect(ref.workspaceId).toBe(WS_ID);
      expect(ref.colormapId).toBe(CM_ID);
    });

    it('throws on wrong service segment', () => {
      const url = `${HUB}/files/orgs/${ORG_ID}/workspaces/${WS_ID}/colormaps/${CM_ID}`;
      expect(() => EvoColormapRef.fromUrl(url)).toThrow();
    });

    it('throws on too few segments', () => {
      const url = `${HUB}/colormap/orgs/${ORG_ID}/workspaces/${WS_ID}`;
      expect(() => EvoColormapRef.fromUrl(url)).toThrow();
    });
  });

  describe('toWorkspaceRef', () => {
    it('returns a ref with the same hubUrl, orgId, and workspaceId', () => {
      const ref = EvoColormapRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, colormapId: CM_ID });
      const wsRef = ref.toWorkspaceRef();
      expect(wsRef.hubUrl).toBe(HUB);
      expect(wsRef.orgId).toBe(ORG_ID);
      expect(wsRef.workspaceId).toBe(WS_ID);
    });
  });

  describe('equals', () => {
    it('returns true for refs with same args', () => {
      const a = EvoColormapRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, colormapId: CM_ID });
      const b = EvoColormapRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, colormapId: CM_ID });
      expect(a.equals(b)).toBe(true);
    });

    it('returns false for different colormapId', () => {
      const a = EvoColormapRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, colormapId: CM_ID });
      const b = EvoColormapRef.fromIds({
        hubUrl: HUB,
        orgId: ORG_ID,
        workspaceId: WS_ID,
        colormapId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
      });
      expect(a.equals(b)).toBe(false);
    });

    it('returns false for null', () => {
      const ref = EvoColormapRef.fromIds({ hubUrl: HUB, orgId: ORG_ID, workspaceId: WS_ID, colormapId: CM_ID });
      expect(ref.equals(null)).toBe(false);
    });
  });
});
