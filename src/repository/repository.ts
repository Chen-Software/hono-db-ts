import type { StoreProvider } from "../providers/store-provider";
import type { EntityFilter } from "../providers/store-backend";

/**
 * `Repository<E, M>` — the HOST that owns an entity's life-cycle at the
 * persistence boundary.
 *
 * This is the place the deferred "global `Registry` -> per-repo" decision lands.
 * The repository:
 *   1. holds the IDENTITY MAP (`cache`: id -> live instance) so the same id
 *      always yields the same object reference within a process — no more
 *      process-wide singleton the model reaches into;
 *   2. performs an optional AUTHORIZATION check (`authorize`) before read /
 *      write / delete, so entity-level access control lives in the host, not in
 *      the medium (fs perms / http auth / db creds stay in their own providers);
 *   3. REHYDRATES plain stored data (`E`) into live model instances (`M`) via
 *      the model class it is given — capacities (getPosts, validations, …) come
 *      back to life on load.
 *
 * It is deliberately thin: it delegates all byte I/O to the `StoreProvider` it
 * wraps and adds only the host concerns (identity, auth, rehydration).
 */
export type AuthOp = "read" | "write" | "delete";

export interface RepositoryOptions<E extends { id: string }, M = E> {
	/** The entity-facing store (already bound to a backend + schema). */
	store: StoreProvider<E>;
	/** The model class used to rehydrate stored data into live instances. */
	Model: new (data: any) => M;
	/** Optional entity-level authorization hook. Throw to deny. */
	authorize?: (op: AuthOp, id: string | null, principal?: unknown) => void;
}

export class Repository<E extends { id: string }, M = E> {
	protected cache = new Map<string, M>();

	constructor(protected opts: RepositoryOptions<E, M>) {}

	/** Insert or upsert; caches the rehydrated instance. */
	async insert(data: Partial<E>): Promise<M> {
		this.opts.authorize?.("write", null);
		const { id, entity } = await this.opts.store.insert(data);
		const inst = new this.opts.Model(entity);
		this.cache.set(id, inst);
		return inst;
	}

	/** Load by id, serving a cached instance when present. */
	async load(id: string, principal?: unknown): Promise<M | undefined> {
		this.opts.authorize?.("read", id, principal);
		const hit = this.cache.get(id);
		if (hit) return hit;
		const entity = await this.opts.store.load(id);
		if (!entity) return undefined;
		const inst = new this.opts.Model(entity);
		this.cache.set(id, inst);
		return inst;
	}

	/** Find (optionally filtered); caches each rehydrated instance. */
	async find(filter?: EntityFilter<E>): Promise<M[]> {
		const entities = await this.opts.store.find(filter);
		return entities.map((e) => {
			const inst = new this.opts.Model(e);
			this.cache.set((e as { id: string }).id, inst);
			return inst;
		});
	}

	/** Delete by id; evicts the cache entry. */
	async delete(id: string): Promise<void> {
		this.opts.authorize?.("delete", id);
		await this.opts.store.delete(id);
		this.cache.delete(id);
	}
}
