import {
	composeCapabilities,
	type CapacityComposer,
	type CapacityDeclaration,
	type CapacityList,
	type CapacityObject,
	type Composed,
} from "../capacities/compose";
import type { SchemaModule } from "../capacities/schema-module";
import { UPDATE_PHASE, type LifecycleHooks } from "../capacities/triggerable";
import { registerModel } from "../registry";

/**
 * `defineModel` — the shared base for every model in the starter.
 *
 * It turns a schema name + a fixed bundle of typia bindings (`schemaModule`)
 * into a CLASS the model `extends`:
 *
 *   - a **unified constructor** — classifies the incoming data through the
 *     class's CURRENT `static classify` (a capacity — `Validatable` — may have
 *     overridden it with the assert variant), assigns the fields, then runs the
 *     `onConstruct` lifecycle hooks (identity-map registration, `onNew`
 *     validation, …);
 *   - the model statics (`schemaName`, `schema`, `is`, `assert`, `validate`,
 *     `classify`, `from`) — the "model class" surface every capacity assumes;
 *   - a **mutable-by-default `update`** that merges the patch in place and runs
 *     the `onUpdate` hooks — `Immutable` / `Versionable` override it with their
 *     reconstruction-based update;
 *   - the declared **capacities** folded onto it via `composeCapabilities`
 *     (`Triggerable` is always applied first), and
 *   - registration in the model registry under `schemaName`, so `Reference`
 *     tags can resolve the target model by name.
 *
 * The constructor argument carries a single object (or a JSON string for
 * `JsonSerialisable` models, which parses before forwarding). An
 * `UPDATE_PHASE` marker smuggled through by `Immutable.update` distinguishes a
 * *reconstruction* from a *fresh* construction: reconstructions skip the
 * `onConstruct` phase (the update path already ran the `onUpdate` hooks).
 */
export interface DefineModelOptions<T> {
	/** Runtime schema name — the string a `Reference` tag targets (e.g. `"UserSchema"`). */
	schemaName: string;
	/** The fixed bundle of typia bindings the model bound concretely. */
	schemaModule: SchemaModule<T>;
	/** Declarative capacity list / object — see `composeCapabilities`. */
	capacities?: CapacityDeclaration;
}

/** The model-class statics `defineModel` provides beyond its capacities. */
export interface BaseModelStatics<T> {
	schemaName: string;
	schema: object;
	/** Current construction-time classify — capacities may override it. */
	classify: (input: unknown) => T;
	/** Type guard from the bound schema module. */
	is: (input: unknown) => input is T;
	/** Throwing assertion from the bound schema module. */
	assert: (input: unknown) => T;
	/** Non-throwing validation from the bound schema module. */
	validate: (input: unknown) => any;
	/** Construct through the unified constructor (subclass-aware). */
	from: (data: T) => any;
	/** The lifecycle hook registry paved by `Triggerable`. */
	readonly hooks: LifecycleHooks;
}

/** The base model class: a constructor plus the model-class statics. */
export type BaseModel<T = unknown> = CapacityComposer<T> & BaseModelStatics<T>;

/**
 * Run lifecycle middleware for a phase against `target`. Hooks are declared as
 * `(target) => any` but some (e.g. `Derivable`'s `onUpdate`) also read a
 * second `patch` argument; forward it when present.
 */
function runHooks(
	hooks: readonly ((...args: any[]) => any)[] | undefined,
	target: any,
	patch?: Record<string, unknown>,
): void {
	for (const fn of hooks ?? []) fn(target, patch);
}

export function defineModel<T, const S extends CapacityList>(
	options: Omit<DefineModelOptions<T>, "capacities"> & { capacities: S },
): Composed<BaseModel<T>, S>;
export function defineModel<T>(
	options: DefineModelOptions<T> & { capacities?: CapacityObject },
): BaseModel<T>;
export function defineModel<T>(
	options: Omit<DefineModelOptions<T>, "capacities"> & {
		capacities?: CapacityDeclaration;
	},
): any {
	const { schemaName, schemaModule, capacities } = options;

	class ModelBase {
		declare static schemaName: string;
		declare static schema: object;
		declare static classify: (input: unknown) => T;
		declare static is: (input: unknown) => input is T;
		declare static assert: (input: unknown) => T;
		declare static validate: (input: unknown) => any;
		declare static from: (data: T) => any;
		declare static hooks: LifecycleHooks;

		constructor(data: any) {
			const Ctor = this.constructor as any;

			// `UPDATE_PHASE` marks a *reconstruction* (from `Immutable.update`):
			// the data is `{ ...entity, ...patch }` with an UPDATE_PHASE marker.
			// Strip the marker, classify the merged candidate, and run the
			// `onUpdate` lifecycle hooks (which validate the reconstructed entity)
			// instead of `onConstruct` — so an invalid patch is rejected here,
			// before a new object escapes. A fresh construct runs `onConstruct`.
			const isReconstruction =
				data && typeof data === "object" && data[UPDATE_PHASE] === true;
			const input = isReconstruction ? { ...data } : data;
			if (isReconstruction) delete input[UPDATE_PHASE];

			// Classify through the class's CURRENT static — `Validatable` may
			// have overridden it with the assert variant, so we look it up
			// dynamically instead of capturing `schemaModule.classify` once.
			const classify = Ctor.classify ?? schemaModule.classify;
			Object.assign(this, classify(input));

			if (isReconstruction) {
				runHooks(Ctor.hooks?.onUpdate, this);
			} else {
				runHooks(Ctor.hooks?.onConstruct, this);
			}
		}

		/**
		 * Base MUTABLE update — validates the merged candidate through the
		 * `onUpdate` hooks (e.g. `Validatable`'s enforcement, `Derivable`'s
		 * recompute) BEFORE committing, then writes it to `this` in place. So an
		 * invalid patch throws and leaves `this` untouched. `Immutable` and
		 * `Versionable` override this with their reconstruction-based update.
		 */
		update(patch: Record<string, unknown>): this {
			// Build the merged candidate WITHOUT mutating `this`, so hooks can
			// reject it before any change is committed.
			const candidate = { ...this, ...patch };
			runHooks((this.constructor as any).hooks?.onUpdate, candidate, patch);
			Object.assign(this, candidate);
			return this;
		}

		/**
		 * Unwrap this instance into a plain value object shaped to the schema.
		 *
		 * Deep-clones the instance WITHOUT constructing a new model, so the
		 * result is a clean, schema-shaped value record (any non-schema /
		 * mixin-injected property is dropped by the clone). The result never
		 * aliases the instance, so it is safe to mutate even when the instance
		 * is `Immutable`-frozen. Useful when a call site needs the raw *data*
		 * shape (e.g. `M.random().toValueObject()`).
		 */
		toValueObject(): T {
			return schemaModule.clone(this) as T;
		}
	}

	ModelBase.schemaName = schemaName;
	ModelBase.schema = schemaModule.schema;
	ModelBase.classify = schemaModule.classify;
	ModelBase.is = schemaModule.is;
	ModelBase.assert = schemaModule.assert;
	ModelBase.validate = schemaModule.validate;
	ModelBase.from = function (this: any, data: T): any {
		return new this(data);
	};

	const composed = composeCapabilities(
		ModelBase as CapacityComposer<T>,
		capacities,
		schemaModule,
	);

	// Register under `schemaName` so `Reference` tags / `Referencible` can
	// resolve the model by name (see `registry.ts`).
	registerModel(schemaName, composed);

	return composed;
}
