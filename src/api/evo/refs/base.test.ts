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

  it('rejects URLs with credentials', () => {
    expect(() => normaliseHubUrl('https://user@au1.evo.seequent.com')).toThrow(/credentials/i);
  });

  it('rejects URLs with queries or fragments', () => {
    expect(() => normaliseHubUrl('https://au1.evo.seequent.com?x=1')).toThrow(/query|fragment/i);
    expect(() => normaliseHubUrl('https://au1.evo.seequent.com#x')).toThrow(/query|fragment/i);
  });

  it('rejects URLs with non-root paths', () => {
    expect(() => normaliseHubUrl('https://au1.evo.seequent.com/api')).toThrow(/path/i);
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

  it('rejects dot segments', () => {
    expect(() => encodeResourcePath('folder/../secret')).toThrow(/unsafe segment/i);
    expect(() => encodeResourcePath('folder/./secret')).toThrow(/unsafe segment/i);
  });

  it('rejects empty segments', () => {
    expect(() => encodeResourcePath('folder//secret')).toThrow(/unsafe segment/i);
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
