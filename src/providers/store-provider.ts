import type { SchemaModule } from "../capacities/schema-module";
import type { EntityFilter, StoreBackend } from "./store-backend";

/**
 * `StoreProvider` — the ENTITY-FACING storage provider.
 *
 * It depends ONLY on the `StoreBackend<E>` port, never on a concrete storage
 * engine. Two backends implement that port:
 *   - `BlobBackend`  — serializes the entity to a UUID-named blob (object store
 *     / fs / db-as-blob). The "UUID-named object" shape the user asked for.
 *   - `SqlBackend`   — maps the entity to a drizzle table (bun:sqlite local /
 *     postgres remote), with real column-level WHERE clauses.
 *
 * So the SAME `StoreProvider` code serves S3, the filesystem, a SQLite file, or
 * a remote Postgres — the model and the service never name a backend; they name
 * a `StoreProvider`, and the backend is a constructor argument. URIs (if the
 * backend is remote) are config the backend parses internally — never an
 * architectural concept up here.
 *
 * The provider:
 *   - keys each entity by `<namespace>/<id>` (delegated to the backend);
 *   - assigns a UUID `id` and an ISO `created_at` when absent, so a caller can
 *     hand in a bare `{ name, email, … }` and get a fully-keyed record back;
 *   - returns plain parsed data (`T`). Instance rehydration to a model class
 *     (with capacities) is the job of `Repository`, which composes this.
 */
export interface StoreProviderOptions<T> {
	/** The model's fixed, concretely-bound typia bundle (toJSON / fromJSON / sql). */
	schema: SchemaModule<T>;
	/** Collection / bucket / table-group name, e.g. `"users"`. */
	namespace: string;
	/** A `StoreBackend` adapter instance (BlobBackend or SqlBackend). */
	backend: StoreBackend<T>;
}

export class StoreProvider<T> {
	constructor(private opts: StoreProviderOptions<T>) {}

	/** `<namespace>/<id>` — the key/row identity (backend-dependent). */
	private key(id: string): string {
		return `${this.opts.namespace}/${id}`;
	}

	/**
	 * Insert (or upsert) one entity. Assigns a UUID `id` and an ISO `created_at`
	 * when absent. Returns the assigned `id` and the (validated) parsed entity.
	 */
	async insert(
		data: Partial<T> & { id?: string; created_at?: string },
	): Promise<{ id: string; entity: T }> {
		const id = data.id ?? crypto.randomUUID();
		const now = new Date().toISOString();
		const body = {
			...data,
			id,
			created_at: data.created_at ?? now,
		} as T;
		await this.opts.backend.insert(this.opts.namespace, body);
		return { id, entity: body };
	}

	/** Load one entity by id, or `undefined` if absent. */
	async load(id: string): Promise<T | undefined> {
		const e = await this.opts.backend.get(this.opts.namespace, id);
		return e ?? undefined;
	}

	/** Patch one entity by id (no-op if absent). */
	async update(id: string, patch: Partial<T>): Promise<void> {
		await this.opts.backend.update(this.opts.namespace, id, patch);
	}

	/** Find entities, optionally filtered. Blob filters locally; SQL compiles to WHERE. */
	async find(filter?: EntityFilter<T>): Promise<T[]> {
		return this.opts.backend.find(this.opts.namespace, filter ?? {});
	}

	/** Delete one entity by id (no-op if absent). */
	async delete(id: string): Promise<void> {
		await this.opts.backend.delete(this.opts.namespace, id);
	}

	/** List all entities in the namespace. */
	async list(): Promise<T[]> {
		return this.find();
	}
}
