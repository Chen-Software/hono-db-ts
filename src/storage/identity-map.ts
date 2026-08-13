/**
 * `IdentityMap` — the single, unified identity map for the starter.
 *
 * This replaces the old `Registry` "capacity" (a process-wide singleton) and
 * the duplicate `Repository.cache` Map. Both the model-level capacities
 * (`Referencible`, and `Persistable`'s in-memory `find` fallback) and every
 * `Repository` now delegate to ONE class:
 *
 *   - Standalone / class-level usage (a model constructed WITHOUT a repository)
 *     falls back to the shared {@link defaultIdentityMap}.
 *   - A `Repository` owns its OWN `IdentityMap` (injected via options, or a
 *     fresh one per repository) and stamps every instance it manages with it,
 *     so foreign-key navigation and identity lookup are SCOPED to that
 *     repository / session — not process-wide. Share ONE `IdentityMap` across
 *     several repositories to build a "unit of work" in which cross-model FK
 *     getters (`post.getUser()`) resolve within the session.
 *
 * The instance → map binding is a non-enumerable own property (see
 * {@link IDENTITY_MAP}); repositories stamp it on each instance they rehydrate
 * via {@link setInstanceMap}.
 */

/** Non-enumerable key holding an instance's owning `IdentityMap`. */
export const IDENTITY_MAP: unique symbol = Symbol.for("starters.identityMap");

export class IdentityMap {
	#stores = new Map<string, Map<string, unknown>>();

	/** Register `instance` under `(modelName, id)`, overwriting any prior entry. */
	register(modelName: string, id: string, instance: unknown): void {
		let store = this.#stores.get(modelName);
		if (!store) {
			store = new Map();
			this.#stores.set(modelName, store);
		}
		store.set(id, instance);
	}

	/** Drop the `(modelName, id)` entry if present. */
	unregister(modelName: string, id: string): void {
		this.#stores.get(modelName)?.delete(id);
	}

	/** Look up a single instance by `(modelName, id)`. */
	get(modelName: string, id: string): unknown {
		return this.#stores.get(modelName)?.get(id);
	}

	/** First instance of `modelName` passing `test`, or `undefined`. */
	find(
		modelName: string,
		test: (instance: any) => boolean,
	): unknown | undefined {
		const store = this.#stores.get(modelName);
		if (!store) return undefined;
		for (const i of store.values()) if (test(i)) return i;
		return undefined;
	}

	/** Instances of `modelName` passing `test`, or every instance if no test. */
	filter(
		modelName: string,
		test: (instance: any) => boolean = () => true,
	): unknown[] {
		const store = this.#stores.get(modelName);
		if (!store) return [];
		return [...store.values()].filter(test);
	}

	/** Every registered instance of `modelName`. */
	all(modelName: string): unknown[] {
		const store = this.#stores.get(modelName);
		return store ? [...store.values()] : [];
	}

	/** Drop one model's entries, or the whole map when `modelName` is omitted. */
	clear(modelName?: string): void {
		if (modelName) this.#stores.delete(modelName);
		else this.#stores.clear();
	}
}

/**
 * Process-wide fallback used by standalone / class-level code paths. This is
 * NOT a "capacity" — just the default map. Repositories opt into their own
 * scope by passing an `IdentityMap`; only code with no repository falls back
 * here.
 */
export const defaultIdentityMap = new IdentityMap();

/** Resolve the `IdentityMap` that owns `inst` (or the shared fallback). */
export function getInstanceMap(inst: any): IdentityMap {
	return inst?.[IDENTITY_MAP] ?? defaultIdentityMap;
}

/**
 * Stamp `inst` with the `IdentityMap` that owns it. No-op (silent) on frozen
 * instances (e.g. an `Immutable` model) — resolution then falls back to
 * `defaultIdentityMap` for that instance.
 */
export function setInstanceMap(inst: any, map: IdentityMap): void {
	try {
		Object.defineProperty(inst, IDENTITY_MAP, {
			value: map,
			enumerable: false,
			configurable: true,
			writable: false,
		});
	} catch {
		// frozen — leave it; identity resolution falls back to the default map.
	}
}
