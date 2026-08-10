import type { Classifiable } from "typia";
import type { CapacityConstructor } from "../capacities/capable";
import {
	composeCapabilities,
	type CapacityDeclaration,
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

		constructor(data: Classifiable<T>) {
			return Object.assign(this, def.schemaModule.classify(data));
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
