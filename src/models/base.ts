import type { Classifiable } from "typia";
import type {
	CapacityConstructor,
	LifecycleHooks,
	LifecyclePhase,
} from "../capacities/capable";
import { UPDATE_PHASE } from "../capacities/capable";
import {
	type CapacityDeclaration,
	composeCapabilities,
} from "../capacities/compose";
import type { SchemaModule } from "../capacities/schema-module";

/**
 * The SHARED BASE MODEL.
 *
 * `User` and `Post` are both produced through {@link defineModel} so they share
 * one classified constructor and one runtime schema surface. The hard
 * constraint that shapes this module:
 *
 *   typia is a COMPILE-TIME transformer. It cannot resolve a *generic* type
 *   argument inside a mixin or factory — `typia.createValidate<T>()` fails with
 *   "non-specified generic argument" under the `@ttsc` bun plugin. So this
 *   factory NEVER calls `typia.*<T>()` itself. Every typia call happens at the
 *   MODEL site (where the schema type is concrete) and is gathered into a single
 *   {@link SchemaModule} handed in here.
 *
 * What the base guarantees at runtime:
 *   - `static schemaName` — a plain STRING naming the schema type
 *     (`"UserSchema"`, `"PostData"`, …). Because nothing at runtime can
 *     re-derive a schema from a type, this is the only *introspectable* handle
 *     on "what schema does this model use?" — logging, dispatch, debugging.
 *     It is read-only: you cannot feed it back into typia (that would mean
 *     reimplementing the transformer).
 *   - `static schema` — the concrete typia schema object (reflect or json),
 *     taken from the schema module, exposed for runtime inspection / Standard
 *     Schema interop.
 *   - a single classified constructor (`schemaModule.classify` +
 *     `Object.assign`).
 *
 * The model declares *which* capacities it wants (`capacities`) and hands in
 * the ONE fixed schema module. The base feeds that module to every capacity
 * during composition; each capacity consumes only its own slice and ignores
 * the rest.
 */
export interface ModelDefinition<T> {
	/**
	 * Runtime schema-type identifier string (introspection only).
	 *
	 * @example "UserSchema" | "PostData"
	 */
	schemaName: string;

	/**
	 * The fixed, complete bundle of concretely-bound typia functions for this
	 * schema (`schema`, `classify`, `toJSON`/`fromJSON`, `encode`/`decode`/
	 * `message`). Bound at the model site — where `T` is concrete — and handed
	 * in once. Capacities pull their slice out of it during composition.
	 */
	schemaModule: SchemaModule<T>;

	/**
	 * Declarative capacity composition — a plain list of capacity references
	 * (the constructor, or its exported name). `Capable` is auto-prepended (and
	 * de-duplicated), so the model never has to remember to put it first.
	 *
	 * @example [JsonSerialisable, ProtobufEncodable]
	 * @example { JsonSerialisable: true, ProtobufEncodable: true }
	 *
	 * The folded result is the PROCESSED class the model `extends`.
	 */
	capacities?: CapacityDeclaration;
}

/**
 * Build a model base class from a single schema module + a capacity list.
 *
 * @example
 * const UserSchemaModule = {
 *   schema: typia.reflect.schema<UserSchema>(),
 *   classify: (d) => typia.plain.assertClassify<UserSchema>(d),
 *   toJSON: typia.json.createAssertStringify<UserSchema>(),
 *   fromJSON: typia.json.createAssertParse<UserSchema>(),
 *   encode: typia.protobuf.createAssertEncode<UserSchema>(),
 *   decode: typia.protobuf.createAssertDecode<UserSchema>(),
 *   message: typia.protobuf.message<UserSchema>(),
 * };
 * const UserModel = defineModel<UserSchema>({
 *   schemaName: "UserSchema",
 *   schemaModule: UserSchemaModule,
 *   capacities: [JsonSerialisable, ProtobufEncodable],
 * });
 * class User extends UserModel {}   // UserModel is the processed "caps" class
 *
 * User.schemaName;          // → "UserSchema"  (runtime string)
 * User.schema;              // → reflect schema object
 * User.toJSON(valid);       // → JSON string (JsonSerialisable pulled it from the module)
 * new User(valid);          // → classified instance
 */
export function defineModel<T>(def: ModelDefinition<T>) {
	class Model {
		/** Runtime schema-type identifier string (introspection only). */
		static schemaName = def.schemaName;

		/** Concrete typia schema object (reflect/json), exposed at runtime. */
		static schema = def.schemaModule.schema;

		/**
		 * Construction-time classify. Defaults to the model's plain `classify` from
		 * the schema module; the `Validatable` capacity OVERRIDES this with a
		 * validated variant (`assertClassify` by default) when it is enabled — so
		 * construction validates unless the model opts out. The constructor reads
		 * `this.constructor.classify` (not `def.schemaModule.classify`) precisely so
		 * that overridden static is picked up at instantiation time.
		 */
		static classify = def.schemaModule.classify;

		/**
		 * Lifecycle-hook registry (shared by the whole composition). Paved by
		 * `Capable` and populated by every behaviour capacity (Validatable, …)
		 * with middleware. The constructor / `update` below are the ONLY places
		 * that read it — capacities never own those methods.
		 */
		static hooks: LifecycleHooks = {
			onInit: [],
			onConstruct: [],
			onUpdate: [],
		};

		/**
		 * Unified `update` — MUTABLE BY DEFAULT.
		 *
		 * The base model is mutable: `udpate` patches `this` IN PLACE and returns
		 * the same instance. Validation (if any) runs FIRST, via the `onUpdate`
		 * lifecycle hook, so a rejected patch never leaves `this` half-mutated.
		 * This is deliberate — immutability is an OPT-IN capacity (`Immutable`),
		 * not the default, because you can always ADD a "produce a new object"
		 * behaviour on top of a mutable base, but you cannot reverse an "always
		 * new object" base back to in-place. So:
		 *
		 *   user.update({ age: 42 })        // mutates `user`, returns `user`
		 *   user.update({ ...user, name })   // partial or full patch, both fine
		 *
		 * The `Immutable` capacity OVERRIDES this method to reconstruct a
		 * brand-new frozen instance instead (every change yields a new object).
		 * Capacities plug in via the `onUpdate` lifecycle hook; none of them
		 * re-implements `update`.
		 */
		update(patch: Record<string, unknown>): any {
			const Ctor = this.constructor as any;
			// Validate the MERGED result BEFORE committing in place, so an invalid
			// patch is rejected without mutating `this`.
			const merged = { ...this, ...patch };
			for (const h of (Ctor.hooks?.onUpdate ??
				[]) as LifecycleHooks["onUpdate"]) {
				h(merged);
			}
			Object.assign(this, patch);
			return this;
		}

		constructor(data: Classifiable<T>) {
			const Ctor = this.constructor as any;
			const raw = data as any;

			// Detect + strip the update phase BEFORE classify (which would drop
			// the symbol when it rebuilds the object).
			const isUpdate = !!(raw && raw[UPDATE_PHASE]);
			if (isUpdate) delete raw[UPDATE_PHASE];

			// 1. onInit hooks — transform / normalise RAW input before classify.
			//    Runs on both construction and update.
			let d = raw;
			for (const h of (Ctor.hooks?.onInit ?? []) as LifecycleHooks["onInit"]) {
				d = h(d) ?? d;
			}

			// 2. classify (may be overridden — e.g. Validatable → assertClassify).
			d = (Ctor.classify as (x: any) => any)(d);

			// 3. assign plain data props. The Immutable capacity later rewrites
			//    these into immutable accessors + freezes the instance (its
			//    constructor wrap runs AFTER this one returns). Models without
			//    Immutable keep plain mutable props.
			Object.assign(this, d);

			// 4. phase-appropriate validation hooks — the middleware contributed by
			//    capacities such as Validatable (`onNew` → onConstruct, `onUpdate`
			//    → onUpdate). Never mutates; may throw to reject.
			const phase: LifecyclePhase = isUpdate ? "onUpdate" : "onConstruct";
			for (const h of (Ctor.hooks?.[phase] ??
				[]) as LifecycleHooks[LifecyclePhase]) {
				h(this);
			}
		}
	}

	// Fold the declared capacities (Capable first, de-duplicated) onto the base,
	// feeding every capacity the SHARED schema module so it can pull its slice.
	// The returned class IS the processed "caps" class the model extends.
	return composeCapabilities(
		Model as unknown as CapacityConstructor,
		def.capacities,
		def.schemaModule,
	) as unknown as typeof Model;
}
