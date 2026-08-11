import type { StoreProvider } from "../providers/store-provider";
import type { EntityFilter } from "../providers/store-backend";
import {
	IdentityMap,
	setInstanceMap,
	type IdentityMap as IdentityMapType,
} from "../storage/identity-map";

/**
 * `Repository<E, M>` — the HOST that owns an entity's life-cycle at the
 * persistence boundary.
 *
 * The repository:
 *   1. owns the IDENTITY MAP (an `IdentityMap`, keyed by model name + id) so the
 *      same id always yields the same object reference — and it is SCOPED TO
 *      THIS repository, not a process-wide singleton the model reaches into.
 *      Pass a SHARED `IdentityMap` to several repositories to build a
 *      session-scoped "unit of work" where cross-model FK getters
 *      (`post.getUser()`) resolve within the session. Every instance the repo
 *      rehydrates is stamped with its map (see `setInstanceMap`);
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
	/**
	 * The identity map this repository scopes instances to. Defaults to a FRESH
	 * `IdentityMap`, so a repository's identity is per-repository (not
	 * process-wide). Share one instance across repositories to get session
	 * scoping (cross-model FK navigation within a unit of work).
	 */
	identityMap?: IdentityMapType;
}

export class Repository<E extends { id: string }, M = E> {
	protected identityMap: IdentityMap;
	protected readonly modelName: string;

	constructor(protected opts: RepositoryOptions<E, M>) {
		this.identityMap = opts.identityMap ?? new IdentityMap();
		this.modelName =
			(this.opts.Model as any).schemaName ?? this.opts.Model.name;
	}

	/** Stamp `inst` with this repository's identity map and register it. */
	private tag(inst: M): M {
		setInstanceMap(inst, this.identityMap);
		const id = (inst as any).id;
		if (id != null) this.identityMap.register(this.modelName, String(id), inst);
		return inst;
	}

	/** Insert or upsert; caches the rehydrated instance in this repo's map. */
	async insert(data: Partial<E>): Promise<M> {
		this.opts.authorize?.("write", null);
		const { id, entity } = await this.opts.store.insert(data);
		const inst = new this.opts.Model(entity);
		this.tag(inst);
		return inst;
	}

	/** Load by id, serving a cached instance when present. */
	async load(id: string, principal?: unknown): Promise<M | undefined> {
		this.opts.authorize?.("read", id, principal);
		const hit = this.identityMap.get(this.modelName, id) as M | undefined;
		if (hit) return hit;
		const entity = await this.opts.store.load(id);
		if (!entity) return undefined;
		const inst = new this.opts.Model(entity);
		this.tag(inst);
		return inst;
	}

	/** Find (optionally filtered); caches each rehydrated instance. */
	async find(filter?: EntityFilter<E>): Promise<M[]> {
		const entities = await this.opts.store.find(filter);
		return entities.map((e) => this.tag(new this.opts.Model(e)));
	}

	/** Delete by id; evicts the identity-map entry. */
	async delete(id: string): Promise<void> {
		this.opts.authorize?.("delete", id);
		await this.opts.store.delete(id);
		this.identityMap.unregister(this.modelName, id);
	}
}
