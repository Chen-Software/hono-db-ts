import type { CapacityConstructor } from "./capable";
import type { SchemaModule } from "./schema-module";

/**
 * `JsonSerialisableSchema` — the type-level MARKER for the capacity.
 *
 * It is the empty object (`Record<never, never>`), mirroring
 * {@link ImmutableSchema}: a no-op in an intersection at both runtime and the
 * type level, but it reads as a deliberate contract in capacity compositions.
 * The runtime behaviour (the `toJSON` / `fromJSON` machinery) lives in the
 * {@link JsonSerialisable} mixin function below.
 */
type JsonSerialisableSchema = Record<never, never>;

/**
 * JsonSerialisable — a capacity that equips a class with JSON (de)serialisation.
 *
 * It adds, to the adorned class:
 *   - `static toJSON`   — `mod.toJSON` (assert + stringify).
 *   - `static fromJSON` — `mod.fromJSON` (parse + validate).
 *   - an instance `toJSON()` that returns `this`, so
 *     `JSON.stringify(instance)` yields the entity's plain object.
 *   - a **JSON-override constructor**: passing a *string* to `new X(json)`
 *     parses it through `fromJSON` first, so `new User('{"name": …}')` builds
 *     exactly like `new User(data)`.
 *
 * The capacity does NOT bind any typia transform itself — it cannot (typia's
 * transformer rejects a generic type argument inside a mixin). Instead it pulls
 * `toJSON` / `fromJSON` out of the {@link SchemaModule} the model handed to
 * `defineModel`. If the model did not declare `JsonSerialisable` in its
 * `capacities`, these two functions simply stay unused in the module — that is
 * the "use them, or ignore them" split.
 *
 * It also registers itself in the capacity registry (see {@link Capable}) so the
 * class is introspectable as `JsonSerialisable` — but only when `Capable` has
 * already paved the registry (the standard guarded idiom
 * `Base.prototype.capacities && Base.prototype.addCapacity("X")`).
 *
 * @example
 * // In the model:
 * const schemaModule = {
 *   schema: typia.reflect.schema<UserSchema>(),
 *   classify: (d) => typia.plain.assertClassify<UserSchema>(d),
 *   toJSON: typia.json.createAssertStringify<UserSchema>(),
 *   fromJSON: typia.json.createAssertParse<UserSchema>(),
 *   // …encode / decode / message also bound here…
 * };
 * const UserModel = defineModel<UserSchema>({
 *   schemaName: "UserSchema",
 *   schemaModule,
 *   capacities: [JsonSerialisable, ProtobufEncodable],
 * });
 * User.toJSON(valid);   // → JSON string (pulled from the module)
 * User.fromJSON(json);  // → validated data
 * new User(jsonString); // parses the string, then classifies
 */
function JsonSerialisable<TBase extends CapacityConstructor>(
	Base: TBase,
	mod: SchemaModule<any>,
) {
	const { toJSON, fromJSON } = mod;
	Base.prototype.capacities && Base.prototype.addCapacity("JsonSerialisable");

	return class extends Base {
		/** Assert + stringify data into a JSON string. */
		static toJSON = toJSON;

		/** Parse + validate a JSON string back into data (throws on bad input). */
		static fromJSON = fromJSON;

		/** Plain data — so `JSON.stringify(instance)` yields the entity object. */
		toJSON() {
			return this;
		}

		constructor(...args: any[]) {
			const head = args[0];
			if (typeof head === "string") {
				// JSON-override: parse the string before classifying/constructing.
				super(fromJSON(head), ...args.slice(1));
			} else {
				super(...args);
			}
		}
	};
}

export { JsonSerialisable, type JsonSerialisableSchema };
