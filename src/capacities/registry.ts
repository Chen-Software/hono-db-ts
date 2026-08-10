/**
 * Registry — process-wide identity map for referencible entities.
 *
 * Relationships need a way to RESOLVE a foreign key into a live instance. That
 * is exactly an identity map: `modelName -> (id -> instance)`. The Registry is
 * deliberately SEPARATE from persistence (Persistable is a later concern) — it
 * answers "given an id, what instance is currently alive?" from memory.
 * Persistable may back this with a store later; Referencible only needs the
 * in-memory map so `post.getUser()` can find the User without a query.
 *
 * Keyed by `static schemaName` (e.g. `"UserSchema"`, `"PostData"`) so two
 * models with the same `id` space do not collide.
 */
class ModelRegistry {
	private stores = new Map<string, Map<string, unknown>>();

	private store(model: string): Map<string, unknown> {
		let s = this.stores.get(model);
		if (!s) {
			s = new Map();
			this.stores.set(model, s);
		}
		return s;
	}

	/** Insert/replace the instance under `id` for `model`. */
	register(model: string, id: string, instance: unknown): void {
		this.store(model).set(id, instance);
	}

	/** Remove the instance under `id` for `model`. */
	unregister(model: string, id: string): void {
		this.store(model).delete(id);
	}

	/** Look up a single instance by id. */
	get(model: string, id: string): unknown | undefined {
		return this.store(model).get(id);
	}

	/** First instance matching `pred`. */
	find(model: string, pred: (i: unknown) => boolean): unknown | undefined {
		for (const i of this.store(model).values()) if (pred(i)) return i;
		return undefined;
	}

	/** All instances matching `pred`. */
	filter(model: string, pred: (i: unknown) => boolean): unknown[] {
		const out: unknown[] = [];
		for (const i of this.store(model).values()) if (pred(i)) out.push(i);
		return out;
	}

	/** Every live instance of `model`. */
	all(model: string): unknown[] {
		return [...this.store(model).values()];
	}

	/** Drop one model's map, or the whole registry. */
	clear(model?: string): void {
		if (model) this.stores.delete(model);
		else this.stores.clear();
	}
}

export const Registry = new ModelRegistry();
export type { ModelRegistry };
