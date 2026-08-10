import type { CapacityConstructor } from "./capable";

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
 * The (de)serialisation functions a model binds when it adopts the capacity.
 *
 * typia's transformer cannot resolve a *generic* type argument inside a mixin
 * (`typia.json.createAssertStringify<T>()` fails with
 * "non-specified generic argument" under the `@ttsc` bun plugin), so the model
 * supplies the already-instantiated, schema-specific functions here — exactly
 * the way {@link Validatable} receives its `validators`. The plain-data schema
 * (`UserSchema`, `PostData`, …) is concrete at the model, so the typia calls
 * resolve fine there.
 */
interface JsonSerializer {
	/** Assert + stringify data into a JSON string. */
	toJSON: (input: unknown) => string;
	/** Parse + validate a JSON string back into data (throws on bad input). */
	fromJSON: (input: string) => unknown;
}

/**
 * JsonSerialisable — a capacity that equips a class with JSON (de)serialisation.
 *
 * It adds, to the adorned class:
 *   - `static toJSON`   — the bound `serializer.toJSON` (assert + stringify).
 *   - `static fromJSON` — the bound `serializer.fromJSON` (parse + validate).
 *   - an instance `toJSON()` that returns `this`, so
 *     `JSON.stringify(instance)` yields the entity's plain object.
 *   - a **JSON-override constructor**: passing a *string* to `new X(json)`
 *     parses it through `fromJSON` first, so `new User('{"name": …}')` builds
 *     exactly like `new User(data)`.
 *
 * It also registers itself in the capacity registry (see {@link Capable}) so the
 * class is introspectable as `JsonSerialisable` — but only when `Capable` has
 * already paved the registry (the standard guarded idiom
 * `Base.prototype.capacities && Base.prototype.addCapacity("X")`).
 *
 * @example
 * const caps = JsonSerialisable(Capable(UserModel), {
 *   toJSON: typia.json.createAssertStringify<UserSchema>(),
 *   fromJSON: typia.json.createAssertParse<UserSchema>(),
 * });
 * class User extends caps {}
 * User.toJSON(valid);        // → JSON string
 * User.fromJSON(json);       // → validated data
 * new User(jsonString);      // parses the string, then classifies
 */
function JsonSerialisable<TBase extends CapacityConstructor>(
	Base: TBase,
	serializer: JsonSerializer,
) {
	Base.prototype.capacities && Base.prototype.addCapacity("JsonSerialisable");

	return class extends Base {
		/** Assert + stringify data into a JSON string. */
		static toJSON = serializer.toJSON;

		/** Parse + validate a JSON string back into data (throws on bad input). */
		static fromJSON = serializer.fromJSON;

		/** Plain data — so `JSON.stringify(instance)` yields the entity object. */
		toJSON() {
			return this;
		}

		constructor(...args: any[]) {
			const head = args[0];
			if (typeof head === "string") {
				// JSON-override: parse the string before classifying/constructing.
				super(serializer.fromJSON(head), ...args.slice(1));
			} else {
				super(...args);
			}
		}
	};
}

export { JsonSerialisable, type JsonSerialisableSchema };
