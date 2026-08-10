/**
 * `StoreBackend<E>` — the PORT every storage backend implements.
 *
 * The `StoreProvider` (and therefore `Repository` / `UserService`) depends ONLY
 * on this interface. Two adapters implement it:
 *
 *   - `BlobBackend` — serializes the entity to a blob (object store / fs /
 *     db-as-blob). The physical contract is `BlobStoreProvider` (key -> bytes).
 *   - `SqlBackend`  — maps the entity to a drizzle table row (bun:sqlite local /
 *     postgres remote). The physical contract is the drizzle query builder.
 *
 * The physical storage API (bytes vs query-builder) lives entirely INSIDE the
 * adapter; the provider above is identical for both. That is what makes the
 * SAME `StoreProvider` / `UserRepo` / `UserService` serve S3, the filesystem, a
 * SQLite file, or a remote Postgres — only the adapter (and its driver) change.
 *
 * This is the exact ports-and-adapters move already used for services, applied
 * one level down: the "port" is the logical entity API, the "adapter" is the
 * concrete storage engine.
 */
export type QueryOp =
	| "eq"
	| "ne"
	| "like"
	| "gt"
	| "gte"
	| "lt"
	| "lte"
	| "in"
	| "null"
	| "notNull";

/** A structured per-field operator, compiled to a SQL predicate by `SqlBackend`. */
export interface FieldQuery {
	op: QueryOp;
	value?: unknown;
}

/**
 * The logical query the unified `StoreProvider` understands.
 *   - `where`  — shallow equality match (AND-combined); used directly by the
 *                blob backend and compiled to `=` by the SQL backend.
 *   - `query`  — structured per-field operators; ignored by the blob backend,
 *                compiled to real WHERE clauses by the SQL backend.
 *   - `limit`  — applied server-side by SQL, client-side by blob.
 */
export interface EntityFilter<E> {
	where?: Partial<Record<keyof E, unknown>>;
	query?: Partial<Record<keyof E, FieldQuery>>;
	limit?: number;
	offset?: number;
}

export interface StoreBackend<E> {
	readonly kind: "blob" | "sql";
	insert(ns: string, e: E): Promise<void>;
	get(ns: string, id: string): Promise<E | null>;
	update(ns: string, id: string, patch: Partial<E>): Promise<void>;
	delete(ns: string, id: string): Promise<void>;
	find(ns: string, filter: EntityFilter<E>): Promise<E[]>;
	/** Escape hatch: returns the native handle (null for blob), e.g. `{ db, table }`. */
	raw(): unknown;
}
