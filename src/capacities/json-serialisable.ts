import type { CapacityComposer } from "./compose";
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
 * It also registers itself in the capacity registry (see {@link Triggerable}) so the
 * class is introspectable as `JsonSerialisable` — but only when `Triggerable` has
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
function JsonSerialisable<TBase extends CapacityComposer>(
	Base: TBase,
	mod?: any,
	options?: JsonSerialisableOptions,
	ctx?: ComposeContext,
): TBase {
	Base.prototype.capacities && Base.prototype.addCapacity("JsonSerialisable");

	// `mod` is the schema module `compose` hands in as the 2nd argument. We use
	// it directly (rather than `Base.prototype.schemaModule`) so the capacity
	// works whether or not the module has been paved onto the prototype — e.g.
	// in unit tests that compose capacities by hand.
	const sm = mod as any;

	// `fromJSON` validation tracks the `Validatable` capacity: when it is also
	// declared, `fromJSON` uses the module's STRICT parse (`createAssertParse`)
	// so deserialisation validates in lock-step with the constructor's
	// `classify`; without it, it falls back to a LENIENT `JSON.parse` (no
	// validation — illegal values pass through). An explicit `options.parse`
	// always wins.
	const validated = ctx?.has?.("Validatable") ?? false;
	const parseVariant = options?.parse ?? (validated ? "fromJSON" : "lenient");
	const parse =
		parseVariant === "lenient"
			? (input: any) => JSON.parse(input)
			: parseVariant === "validateParse"
				? sm.validateParse
				: parseVariant === "isParse"
					? sm.isParse
					: sm.fromJSON;

	// `static toJSON` — the module's assert + stringify (returns a JSON string).
	const stringify = (data: any) => sm.toJSON(data);

	(Base as any).toJSON = stringify;
	// Instance `toJSON()` returns `this` (NOT `stringify(this)`): `JSON.stringify`
	// invokes `toJSON(key)` and then serialises the RETURNED value. Returning the
	// serialised *string* would make `JSON.stringify(instance)` emit a
	// double-quoted string (`"\"{...}\""`) instead of the object. Returning
	// `this` lets `JSON.stringify` serialise the instance's own data fields.
	Base.prototype.toJSON = function (this: any) {
		return this;
	};
	(Base as any).fromJSON = parse;
	Base.prototype.fromJSON = function (this: any, input: any) {
		return parse(input);
	};

	return class extends Base {
		constructor(...args: any[]) {
			const head = args[0];
			if (typeof head === "string") {
				// JSON-override: PARSE the string (via `fromJSON`) before
				// classifying/constructing. Validation tracks Validatable: the
				// strict parse throws on bad input when the validator is on.
				super(parse(head), ...args.slice(1));
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
