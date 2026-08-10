/**
 * `FsProvider` — the local-filesystem backend, re-exported from the pre-existing
 * `FsStore` so callers can use the provider vocabulary uniformly:
 *
 *   new StoreProvider({ backend: new FsProvider("/var/data") })
 *
 * `FsStore` already implements the `BlobStoreProvider` contract: `put` writes a
 * file under `rootDir`, keys are sanitised so a hostile `../../etc/passwd`
 * cannot escape, and `query` enumerates + filters JSON locally. A "filesystem
 * object store" is exactly this — keys become paths, blobs become files.
 */
export { FsStore as FsProvider } from "../storage/fs-store";
