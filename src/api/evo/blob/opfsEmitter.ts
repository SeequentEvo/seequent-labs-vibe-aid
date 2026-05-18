/**
 * Tiny typed event emitter used by `OpfsBlobStore`.
 *
 * Avoids pulling in a dependency. Listeners are stored per-event in a `Set`;
 * `on()` returns an `Unsubscribe`. Errors thrown by listeners are caught and
 * reported via `console.error` so one bad listener cannot break others.
 */

import type { BlobStoreEvents, Unsubscribe } from "./types";

type Listener<E extends keyof BlobStoreEvents> = (
  data: BlobStoreEvents[E],
) => void;

export class TypedEmitter {
  private readonly listeners = new Map<
    keyof BlobStoreEvents,
    Set<(data: BlobStoreEvents[keyof BlobStoreEvents]) => void>
  >();

  on<E extends keyof BlobStoreEvents>(
    event: E,
    listener: Listener<E>,
  ): Unsubscribe {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const erased = listener as (
      data: BlobStoreEvents[keyof BlobStoreEvents],
    ) => void;
    set.add(erased);
    return () => {
      this.listeners.get(event)?.delete(erased);
    };
  }

  emit<E extends keyof BlobStoreEvents>(
    event: E,
    data: BlobStoreEvents[E],
  ): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(data);
      } catch (err) {
        console.error(`[BlobStore] listener for "${event}" threw`, err);
      }
    }
  }
}
