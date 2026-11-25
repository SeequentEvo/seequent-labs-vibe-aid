import type { BlobStore } from "./store";
import { InMemoryBlobStore } from "@/api/evo";
import { OpfsBlobStore } from "@/api/evo";

let blobStorePromise: Promise<BlobStore> | null = null;

/** Application-wide BlobStore. Uses OPFS in browsers that support it. */
export function getBlobStore(): Promise<BlobStore> {
  if (!blobStorePromise) {
    blobStorePromise = (async () => {
      if (
        typeof navigator !== "undefined" &&
        "storage" in navigator &&
        typeof navigator.storage?.getDirectory === "function"
      ) {
        try {
          return await OpfsBlobStore.create();
        } catch {
          // Private browsing or restricted storage can disable OPFS.
        }
      }
      return new InMemoryBlobStore();
    })();
  }
  return blobStorePromise;
}
