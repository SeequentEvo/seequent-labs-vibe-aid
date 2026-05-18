import { EvoWorkspaceRef } from './workspace';
import { EvoFileRef } from './file';
import { EvoObjectRef } from './object';
import { EvoBlockModelRef } from './block-model';
import { EvoColormapRef } from './colormap';

export type AnyEvoRef =
  | EvoWorkspaceRef
  | EvoFileRef
  | EvoObjectRef
  | EvoBlockModelRef
  | EvoColormapRef;

/**
 * Parse an Evo resource URL into the appropriate ref class.
 * Throws a descriptive Error on malformed or unrecognised URLs.
 */
export function parseEvoUrl(url: string): AnyEvoRef {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Malformed URL: ${url}`);
  }

  const segment = parsed.pathname.split('/').filter(Boolean)[0];

  switch (segment) {
    case 'workspace':
      return EvoWorkspaceRef.fromUrl(url);
    case 'file':
      return EvoFileRef.fromUrl(url);
    case 'geoscience-object':
      return EvoObjectRef.fromUrl(url);
    case 'blockmodel':
      return EvoBlockModelRef.fromUrl(url);
    case 'colormap':
      return EvoColormapRef.fromUrl(url);
    default:
      throw new Error(
        `Unrecognised Evo service segment '${segment}' in URL: ${url}`,
      );
  }
}

/**
 * Like parseEvoUrl but returns null instead of throwing on malformed/unrecognised URLs.
 */
export function tryParseEvoUrl(url: string): AnyEvoRef | null {
  try {
    return parseEvoUrl(url);
  } catch {
    return null;
  }
}
