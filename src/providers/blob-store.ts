/**
 * `BlobStoreProvider` — the PROVIDER-VOCABULARY name for the unified storage
 * primitive we already built in `../storage/store`.
 *
 * A backend provider is any module that satisfies the `key -> blob` contract
 * (`get` / `put` / `delete` / `list`, plus an OPTIONAL `query`). That is
 * exactly the `Store` interface, so instead of redefining it we *alias* it here
 * and re-export the concrete reference implementations + helpers. This is the
 * one place the "provider" vocabulary meets the older "store" vocabulary;
 * everything above (StoreProvider, Repository, UserService) speaks
 * `BlobStoreProvider` and never imports `../storage/store` directly.
 *
 * Backends that implement this contract today:
 *   - `MemoryStore`        (in-process map; the default for tests)
 *   - `FsProvider`         (local filesystem; `./fs-provider`)
 *   - `ObjectStoreProvider`(S3-like object store; `./object-store`)
 *   - `DbProvider`         (SQL-ish, document-in-DB; `./db-provider`)
 *
 * A provider is NOT defined by "having a URI" — it is defined by the capability
 * interface it implements. `TelemetryProvider` / `MonitoringProvider` (see
 * `./observability`) are providers with zero URI involvement, which is exactly
 * why we do NOT build a "UriProvider" router: URIs are leaf-config a backend
 * parses internally with `fetch` / `new URL()`, not an architectural concept.
 */
export type BlobStoreProvider = import("../storage/store").Store;
export type BlobStoreObject = import("../storage/store").StoreObject;
export type BlobStoreQuery = import("../storage/store").StoreQuery;

export {
	decodeJson,
	encodeJson,
	MemoryStore,
	matchesFilter,
	StoreError,
	StoreRegistry,
} from "../storage/store";
