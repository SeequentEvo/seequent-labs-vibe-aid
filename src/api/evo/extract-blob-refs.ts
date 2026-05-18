/** SHA-256 hex pattern: exactly 64 lowercase hex characters. */
const SHA256_RE = /^[0-9a-f]{64}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recursively walk a geoscience object body and collect every SHA-256 blob
 * reference from ArrayTableInfo and LookupTableInfo nodes.
 *
 * A node matches if:
 * 1. It is a plain object (not null, not an array)
 * 2. It has a `data` property whose value is a string matching SHA256_RE
 * 3. It has at least one of: `data_type`, `keys_data_type` (sibling properties)
 *
 * This is intentionally generic — it works for any object type (pointset,
 * drillhole, mesh, etc.) without knowing the schema.
 */
export function extractBlobRefs(body: unknown): Set<string> {
  const refs = new Set<string>();
  walk(body, refs);
  return refs;
}

function walk(node: unknown, refs: Set<string>): void {
  if (Array.isArray(node)) {
    for (const element of node) {
      walk(element, refs);
    }
    return;
  }

  if (!isPlainObject(node)) {
    return;
  }

  const data = node['data'];
  if (
    typeof data === 'string' &&
    SHA256_RE.test(data) &&
    ('data_type' in node || 'keys_data_type' in node)
  ) {
    refs.add(data);
  }

  for (const value of Object.values(node)) {
    walk(value, refs);
  }
}
