/**
 * Pagination model shared across Evo list endpoints.
 *
 * Wire envelopes differ per service (Workspaces uses a `links`-nested shape;
 * Geoscience Objects uses an inline-meta shape with an `objects` results
 * key). Each service module owns the schema + parser for its envelope and
 * normalises the result into this `Page<T>` view.
 */

export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}
