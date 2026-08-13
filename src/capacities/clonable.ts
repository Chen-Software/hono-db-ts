import type {
	CapacityComposer,
	CapacityOptions,
	ComposeContext,
} from "./compose";
import type { IValidation } from "@typia/interface";
import type { SchemaModule } from "./schema-module";

/**
 * The four typia clone variants a model binds in its {@link SchemaModule}:
 *
 *  - `clone`         — deep copy, NO validation.
 *  - `assertClone`   — deep copy + assert (throws on invalid).
 *  - `isClone`       — deep copy, or `null` if invalid.
 *  - `validateClone` — non-throwing; returns `IValidation<T>`.
 */
export type ClonableVariant =
	| "clone"
	| "assertClone"
	| "isClone"
	| "validateClone";

/** Per-instance clone API a `Clonable` model exposes. */
export interface ClonableInstance<T = unknown> {
	/** Deep-copy this instance via the model's selected clone variant. */
	clone(): T;
}

/** Static clone API a `Clonable` model exposes. */
export interface ClonableStatic<T = unknown> {
	/**
	 * The selected clone function. Its exact return shape depends on the
	 * variant (`T` for `clone`/`assertClone`, `T | null` for `isClone`,
	 * `IValidation<T>` for `validateClone`).
	 */
	clone: (input: any) => T | T | null | IValidation<any>;
}

/**
 * Options for the {@link Clonable} mixin — choose which typia clone variant to
 * surface. When omitted, the variant defaults to `assertClone` if `Validatable`
 * is also declared (so clones are validated by construction) and otherwise to
 * the plain `clone`.
 */
export interface ClonableOptions {
	/** Explicitly select the clone variant. */
	clone?: ClonableVariant;
}

/**
 * `Clonable` — the CAPACITY that makes a model deep-copyable.
 *
 * It consumes the clone slice (`clone` / `assertClone` / `isClone` /
 * `validateClone`) from the model's {@link SchemaModule} and exposes it as a
 * single `clone` entry point, both statically (`M.clone(data)`) and on instances
 * (`inst.clone()`), so the SAME deep-copy semantics are available from either
 * side of the model boundary.
 *
 * Variant selection (driven by `options.clone` and the presence of
 * `Validatable`):
 *
 *  - explicit `options.clone` wins (e.g. `{ clone: "validateClone" }`).
 *  - otherwise, when `Validatable` is also declared, the default upgrades to
 *    `assertClone` — so a clone of invalid data throws rather than silently
 *    propagating garbage.
 *  - otherwise the plain `clone` (no validation) is used.
 *
 * This is exactly the "decide whether to use them, or ignore them" split the
 * architecture is built around: `Clonable` reads only the clone slice and leaves
 * everything else in the module untouched.
 */
export function Clonable<TBase extends CapacityComposer>(
	Base: TBase,
	schemaModule: SchemaModule<any>,
	options?: CapacityOptions,
	ctx?: ComposeContext,
): TBase & ClonableStatic & ClonableInstance {
	const hasValidatable = ctx?.has("Validatable") ?? false;
	const variant =
		(options?.["clone"] as ClonableVariant | undefined) ??
		(hasValidatable ? "assertClone" : "clone");
	const cloneFn = schemaModule[variant] ?? schemaModule.clone;

	Base.prototype.capacities && Base.prototype.addCapacity("Clonable");

	return class extends (Base as any) {
		static clone = cloneFn;

		/** Deep-copy this instance, returning a NEW instance of the same model. */
		clone() {
			const cloned = (this.constructor as unknown as ClonableStatic).clone(
				this,
			);
			// `validateClone` returns an `IValidation`, not instance data — return
			// it raw (as the static does) rather than reconstructing an instance
			// from the validation envelope.
			if (variant === "validateClone") return cloned;
			if (cloned == null) return cloned;
			return new (this.constructor as any)(cloned);
		}
	} as unknown as TBase & ClonableStatic & ClonableInstance;
}
