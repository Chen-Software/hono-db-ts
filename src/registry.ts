/**
 * Model registry — maps a model's `schemaName` (the string a `Reference` tag
 * targets, e.g. `"UserSchema"`) to its live class. This closes the loop the
 * `Reference` tag needs: the tag only carries a *string* target, but the
 * in-memory `Referencible` resolver must resolve that string to a concrete
 * class (to read `schemaName` for the identity-map scan and to attach
 * prototype accessors). Kept deliberately separate from the SQL `tableRegistry`
 * (which maps model name → drizzle `Table`) because the two projections have
 * different lifetimes and concerns.
 *
 * Populated by `defineModel` (see `models/base.ts`) at class-creation time, so
 * every model is registered before any relation is resolved (relations resolve
 * lazily, inside the accessor thunk, well after all models have loaded).
 */

const modelRegistry = new Map<string, any>();

/** Register a model class under its `schemaName`. */
export function registerModel(name: string, ctor: any): void {
	modelRegistry.set(name, ctor);
}

/** Resolve a model class by its `schemaName`. Throws if unregistered. */
export function resolveModel(name: string): any {
	const ctor = modelRegistry.get(name);
	if (!ctor) {
		throw new Error(
			`model registry: no model registered under "${name}". ` +
				`Ensure the target model's defineModel runs (import it) before the ` +
				`relation is resolved.`,
		);
	}
	return ctor;
}

/**
 * Lightweight membership check — does a model exist under `name`? Cheaper than
 * {@link resolveModel} (no class fetch) and NON-throwing, so it's safe to call
 * at relation-resolution time purely to validate a `Reference` tag's target
 * without pulling the class just to read its `schemaName`.
 */
export function hasModel(name: string): boolean {
	return modelRegistry.has(name);
}

/** `[schemaName, ctor]` for every registered model (used by drift guards). */
export function listModels(): [string, any][] {
	return Array.from(modelRegistry.entries());
}
