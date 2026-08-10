/**
 * `Store` — the UNIFIED storage abstraction.
 *
 * Every persistence backend (S3, LakeFS, a DB behind an HTTP service, the local
 * filesystem, a git orphan branch, even `localStorage` behind a localhost web
 * service) is *the same shape*: asynchronous `key -> blob` I/O. The only things
 * that differ between backends are the ADDRESS and the TRANSPORT — which is the
 * driver's problem, never the model's.
 *
 * This is deliberately a SERVICE, not a capacity. The model-facing behaviour
 * lives in the `Persistable` capacity (`../capacities/persistable.ts`); it holds
 * a `Store` (injected via options) and ships bytes to it. Keeping the two
 * separate means the SAME model targets in-memory in tests and S3 in prod by
 * swapping one injected `Store` — no forking, no backend code in the model.
 *
 * `query` is OPTIONAL on the interface but IS part of the uniform contract:
 * backends with a real engine (DB, LakeFS) delegate; object stores (fs, git,
 * memory) answer it by enumerating under `prefix` + applying `filter` to the
 * decoded JSON locally. So `Model.find(filter)` works identically everywhere.
 */

/** A stored blob. `data` is always raw bytes; `meta` is opaque backend headers. */
export interface StoreObject {
	key: string;
	data: Uint8Array;
	meta?: Record<string, string>;
}

/** A (serialisable) query. `filter` is a shallow key/value match on the decoded
 *  JSON object — forwardable to a remote engine, or applied locally. */
export interface StoreQuery {
	prefix?: string;
	filter?: Record<string, unknown>;
	limit?: number;
}

export interface Store {
	/** Backend name (for logging / introspection). */
	readonly name: string;

	/** Fetch one blob, or `undefined` if absent. */
	get(key: string): Promise<StoreObject | undefined>;

	/** Write/replace a blob. */
	put(
		key: string,
		data: Uint8Array,
		meta?: Record<string, string>,
	): Promise<void>;

	/** Remove a blob (no-op if absent). */
	delete(key: string): Promise<void>;

	/** List keys under an optional prefix. */
	list(prefix?: string): Promise<string[]>;

	/** Optional: real query for engine-backed stores; local stores implement it
	 *  by enumeration + in-memory filter. The capacity relies on this existing
	 *  for `Model.find`. */
	query?(q: StoreQuery): Promise<StoreObject[]>;
}

/** Raised when a `Store` operation fails (network, fs, git, …). */
export class StoreError extends Error {
	constructor(
		readonly store: string,
		readonly op: string,
		readonly key: string | undefined,
		cause?: unknown,
	) {
		super(`Store[${store}].${op}(${key ?? ""}) failed: ${String(cause)}`);
		this.name = "StoreError";
	}
}

// ---------------------------------------------------------------------------
// `StoreRegistry` — name -> Store, the dependency-injection seam. Models name a
// store by string in `Persistable` options; the registry resolves it. Keeps
// backend wiring out of model declarations.
// ---------------------------------------------------------------------------
const stores = new Map<string, Store>();

export const StoreRegistry = {
	register(name: string, store: Store): void {
		stores.set(name, store);
	},
	get(name: string): Store | undefined {
		return stores.get(name);
	},
	has(name: string): boolean {
		return stores.has(name);
	},
	/** Resolve a store by instance or registered name. */
	resolve(store: Store | string): Store {
		if (typeof store !== "string") return store;
		const s = stores.get(store);
		if (!s) {
			throw new Error(
				`StoreRegistry: no store registered under "${store}". ` +
					`Known: ${[...stores.keys()].join(", ") || "(none)"}.`,
			);
		}
		return s;
	},
};

// ---------------------------------------------------------------------------
// `MemoryStore` — in-process map. The default for tests / single-process use,
// and the canonical reference implementation of the `Store` contract.
// ---------------------------------------------------------------------------
export class MemoryStore implements Store {
	readonly name = "memory";
	private map = new Map<string, StoreObject>();

	async get(key: string): Promise<StoreObject | undefined> {
		return this.map.get(key);
	}
	async put(
		key: string,
		data: Uint8Array,
		meta?: Record<string, string>,
	): Promise<void> {
		this.map.set(key, { key, data, meta });
	}
	async delete(key: string): Promise<void> {
		this.map.delete(key);
	}
	async list(prefix = ""): Promise<string[]> {
		return [...this.map.keys()].filter((k) => k.startsWith(prefix));
	}
	async query(q: StoreQuery): Promise<StoreObject[]> {
		const out: StoreObject[] = [];
		for (const obj of this.map.values()) {
			if (q.prefix && !obj.key.startsWith(q.prefix)) continue;
			if (q.filter && !matchesFilter(decodeJson(obj.data), q.filter)) continue;
			out.push(obj);
			if (q.limit && out.length >= q.limit) break;
		}
		return out;
	}
}

// --- shared helpers (used by fs/git stores too) -----------------------------
export function decodeJson(bytes: Uint8Array): any {
	return JSON.parse(new TextDecoder().decode(bytes));
}
export function encodeJson(value: unknown): Uint8Array {
	return new TextEncoder().encode(JSON.stringify(value));
}
/** Shallow equality of every `filter` key against `data`. */
export function matchesFilter(
	data: any,
	filter: Record<string, unknown>,
): boolean {
	if (!data || typeof data !== "object") return false;
	for (const [k, v] of Object.entries(filter)) {
		if (!Object.is(data[k], v)) return false;
	}
	return true;
}

export type { Store, StoreObject, StoreQuery };
