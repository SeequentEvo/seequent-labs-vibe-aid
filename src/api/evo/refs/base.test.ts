import { describe, it, expect } from 'vitest';
import { normaliseHubUrl, encodeResourcePath, decodeResourcePath } from './base';

describe('normaliseHubUrl', () => {
  it('accepts a valid https URL unchanged', () => {
    expect(normaliseHubUrl('https://au1.evo.seequent.com')).toBe('https://au1.evo.seequent.com');
  });

  it('strips a single trailing slash', () => {
    expect(normaliseHubUrl('https://au1.evo.seequent.com/')).toBe('https://au1.evo.seequent.com');
  });

  it('strips multiple trailing slashes', () => {
    expect(normaliseHubUrl('https://au1.evo.seequent.com///')).toBe(
      'https://au1.evo.seequent.com',
    );
  });

  it('rejects http:// URLs', () => {
    expect(() => normaliseHubUrl('http://au1.evo.seequent.com')).toThrow(/https/);
  });

  it('rejects a bare domain without scheme', () => {
    expect(() => normaliseHubUrl('au1.evo.seequent.com')).toThrow(/https/);
  });
});

describe('encodeResourcePath', () => {
  it('leaves a simple single segment unchanged', () => {
    expect(encodeResourcePath('myfile.txt')).toBe('myfile.txt');
  });

  it('leaves a multi-segment path unchanged when no encoding needed', () => {
    expect(encodeResourcePath('folder/sub/file.txt')).toBe('folder/sub/file.txt');
  });

  it('encodes special chars in segments', () => {
    expect(encodeResourcePath('my file/name#1')).toBe('my%20file/name%231');
  });

  it('preserves / separators between segments', () => {
    const result = encodeResourcePath('a/b/c');
    expect(result.split('/').length).toBe(3);
  });
});

describe('decodeResourcePath', () => {
  it('decodes a percent-encoded path', () => {
    expect(decodeResourcePath('my%20file/name%231')).toBe('my file/name#1');
  });

  it('round-trips through encodeResourcePath', () => {
    const original = 'my folder/sub dir/file name#1.txt';
    expect(decodeResourcePath(encodeResourcePath(original))).toBe(original);
  });
});
