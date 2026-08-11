import type { CapacityConstructor } from "./capable";
import type { ComposeContext } from "./compose";
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
 * **Validation tracks `Validatable`** — `fromJSON` (and the JSON-override
 * constructor) validate the parsed data *only* when the model also declares the
 * `Validatable` capacity. With `Validatable` present, `fromJSON` uses the
 * module's strict parse (`fromJSON` = `createAssertParse`) so deserialisation
 * validates in lock-step with the constructor's `classify`. Without it, `fromJSON`
 * falls back to a LENIENT `JSON.parse` (no validation — illegal values pass
 * through), exactly mirroring how `Clonable` only validates its clone when the
 * validator is present. This closes the gap where `fromJSON`'s strictness was
 * coupled to the model's module binding rather than to the `Validatable` toggle.
 * Override explicitly with `{ parse: "fromJSON" | "validateParse" | "isParse" |
 * "lenient" }`.
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
 * User.fromJSON(json);  // → validated data (Validatable present ⇒ strict)
 * new User(jsonString); // parses the string, then classifies
 */
function JsonSerialisable<TBase extends CapacityConstructor>(
	Base: TBase,
	mod: SchemaModule<any>,
	_options: JsonSerialisableOptions = {},
	ctx?: ComposeContext,
): TBase {
	const { toJSON } = mod;
	Base.prototype.capacities && Base.prototype.addCapacity("JsonSerialisable");

	// Parse variant — validated when the validator capacity is also declared,
	// lenient (`JSON.parse`, no validation) otherwise. Like `Clonable`, the
	// validator "switches on" validation; without it deserialisation is
	// unvalidated and permits illegal values. An explicit option wins.
	const parseFn: (s: string) => any =
		_options.parse === "lenient"
			? (s) => JSON.parse(s)
			: _options.parse
				? (mod[_options.parse] as (s: string) => any)
				: ctx?.has("Validatable")
					? (mod.fromJSON as (s: string) => any)
					: (s) => JSON.parse(s);

	return class extends Base {
		/** Assert + stringify data into a JSON string. */
		static toJSON = toJSON;

		/** Parse (+ validate when Validatable is present) a JSON string. */
		static fromJSON = parseFn;

		/** Plain data — so `JSON.stringify(instance)` yields the entity object. */
		toJSON() {
			return this;
		}

		constructor(...args: any[]) {
			const head = args[0];
			if (typeof head === "string") {
				// JSON-override: parse the string (via the variant-aware parse)
				// before classifying/constructing. Validation tracks Validatable:
				// the strict parse throws on bad input when the validator is on.
				super(parseFn(head), ...args.slice(1));
			} else {
				super(...args);
			}
		}
	};
}

export { JsonSerialisable, type JsonSerialisableSchema };

/**
 * Options for the {@link JsonSerialisable} capacity.
 *
 * `parse` — which parse strategy backs `static fromJSON` and the JSON-override
 * constructor. Defaults to the VALIDATED `fromJSON` (assert parse) when the
 * model also declares `Validatable`, and to a LENIENT `JSON.parse` (no
 * validation — allows illegal values) otherwise. This mirrors how `Clonable`
 * defaults its clone to the validated `assertClone` *only* when the validator
 * capacity is present: validation is an opt-in governed by `Validatable`, and
 * without it deserialisation is deliberately unvalidated. An explicit option
 * always wins.
 */
export interface JsonSerialisableOptions {
	parse?: "fromJSON" | "validateParse" | "isParse" | "lenient";
}
