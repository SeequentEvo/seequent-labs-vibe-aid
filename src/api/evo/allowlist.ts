const allowedOrigins = new Set<string>();

function getOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid Evo URL: ${JSON.stringify(value)}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`Evo URL must use HTTPS: ${JSON.stringify(value)}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`Evo URL must not contain user credentials`);
  }
  return parsed.origin;
}

export function registerEvoOrigin(value: string): void {
  allowedOrigins.add(getOrigin(value));
}

export function registerEvoOrigins(values: readonly string[]): void {
  for (const value of values) registerEvoOrigin(value);
}

export function clearEvoOrigins(): void {
  allowedOrigins.clear();
}

export function assertEvoBearerUrl(value: string): void {
  const origin = getOrigin(value);
  if (!allowedOrigins.has(origin)) {
    throw new Error(`Refusing to send bearer credentials to untrusted origin: ${origin}`);
  }
}

export function isEvoBearerUrlAllowed(value: string): boolean {
  try {
    return allowedOrigins.has(getOrigin(value));
  } catch {
    return false;
  }
}
