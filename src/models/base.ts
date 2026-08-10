import type { Classifiable } from "typia";

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
 *   MODEL site (where the schema type is concrete) and is handed in as a
 *   pre-built function (`classify`) or object (`schema`).
 *
 * What the base guarantees at runtime:
 *   - `static schemaName` — a plain STRING naming the schema type
 *     (`"UserSchema"`, `"PostData"`, …). Because nothing at runtime can
 *     re-derive a schema from a type, this is the only *introspectable* handle
 *     on "what schema does this model use?" — logging, dispatch, debugging.
 *     It is read-only: you cannot feed it back into typia (that would mean
 *     reimplementing the transformer), which is exactly why the concrete
 *     static functions (validate / toJSON / encode / …) still live in the
 *     models / capacities and not here.
 *   - `static schema` — the concrete typia schema object (reflect or json),
 *     also exposed for runtime inspection / Standard Schema interop.
 *   - a single classified constructor (`assertClassify` + `Object.assign`).
 */
export interface ModelDefinition<T> {
	/**
	 * Runtime schema-type identifier string (introspection only).
	 *
	 * @example "UserSchema" | "PostData"
	 */
	schemaName: string;

	/** Concrete typia schema object (reflect/json), exposed at runtime. */
	schema?: object;

	/** Concrete `typia.plain.assertClassify<ConcreteSchema>` — passed in because
	 *  typia cannot be invoked generically inside this factory. */
	classify: (data: Classifiable<T>) => T;
}

/**
 * Build a model base class from concretely-bound, schema-specific pieces.
 *
 * @example
 * const UserModel = defineModel<UserSchema>({
 *   schemaName: "UserSchema",
 *   schema: typia.reflect.schema<UserSchema>(),
 *   classify: (d) => typia.plain.assertClassify<UserSchema>(d),
 * });
 * const caps = ProtobufEncodable(JsonSerialisable(Capable(UserModel), json), pb);
 * class User extends caps {}
 *
 * User.schemaName;          // → "UserSchema"  (runtime string)
 * User.schema;              // → reflect schema object
 * new User(valid);          // → classified instance
 */
export function defineModel<T>(def: ModelDefinition<T>) {
	class Model {
		/** Runtime schema-type identifier string (introspection only). */
		static schemaName = def.schemaName;

		/** Concrete typia schema object (reflect/json), exposed at runtime. */
		static schema = def.schema;

		constructor(data: Classifiable<T>) {
			return Object.assign(this, def.classify(data));
		}
	}

	return Model;
}
