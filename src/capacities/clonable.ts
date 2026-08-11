import type { CapacityConstructor } from "./capable";
import type { ComposeContext } from "./compose";
import type { SchemaModule } from "./schema-module";

/**
 * Which `clone` variant {@link Clonable} uses.
 *   - `"clone"`        — `createClone` (deep copy, NO validation)
 *   - `"assertClone"`  — `createAssertClone` (deep copy + asserts; throws on invalid)  ← DEFAULT when Validatable is present
 *   - `"isClone"`      — `createIsClone` (deep copy, or `null` if invalid)
 *   - `"validateClone"`— `createValidateClone` (non-throwing; `IValidation<T>`)
 */
export type CloneVariant =
	| "clone"
	| "assertClone"
	| "isClone"
	| "validateClone";

/**
 * Options for the {@link Clonable} capacity.
 *
 * - `clone` — pick the clone variant. Defaults to `"assertClone"` when the
 *   model also declares `Validatable` (so cloning validates by default, matching
 *   "validation by default if the validator capacity is enabled"), and to the
 *   plain `"clone"` otherwise. Override explicitly to change or disable the
 *   validation — e.g. `{ clone: "clone" }` to opt out, or `"validateClone"` to
 *   collect errors instead of throwing.
 */
export interface ClonableOptions {
	clone?: CloneVariant;
}

/**
 * Clonable — equips a class with a `clone` method, driven entirely by the
 * {@link SchemaModule} the model handed to `defineModel`.
 *
 * Adds to the adorned class:
 *   - `static clone(input)`      — clone the given data/instance (`mod[variant]`).
 *   - instance `clone()`         — returns a BRAND-NEW instance of the same
 *     class, cloned from `this`. For `validateClone` it returns the raw
 *     `IValidation`; for `isClone` it returns `null` when the source is invalid.
 *
 * **Validator-driven default** — when the model declares `Validatable`, the
 * default variant is `"assertClone"` (validated clone); otherwise `"clone"`.
 * This is the "validator overrides an unvalidated clone when enabled" behaviour,
 * and — like everything here — an explicit `clone` option wins.
 *
 * @example
 * const UserModel = defineModel<UserSchema>({
 *   schemaName: "UserSchema",
 *   schemaModule: UserSchemaModule,
 *   capacities: [JsonSerialisable, ProtobufEncodable, Validatable, Clonable],
 * });
 * const u = new User({ ... });
 * const copy = u.clone();          // → new User, deep-copied + asserted
 * const raw = User.clone(someData); // → cloned plain data
 */
function Clonable<TBase extends CapacityConstructor>(
	Base: TBase,
	mod: SchemaModule<any>,
	options: ClonableOptions = {},
	ctx?: ComposeContext,
): TBase {
	// Default to the validated variant when the validator capacity is also
	// declared; otherwise to the plain (unvalidated) clone. An explicit option
	// always wins.
	const variant: CloneVariant =
		options.clone ?? (ctx?.has("Validatable") ? "assertClone" : "clone");

	const cloneFn = mod[variant] as (input: any) => any;

	Base.prototype.capacities && Base.prototype.addCapacity("Clonable");

	return class extends Base {
		/** Clone the given data/instance via the selected variant. */
		static clone = (input: any): any => cloneFn(input);

		/**
		 * Clone this instance into a NEW instance of the same class.
		 * For `validateClone` the raw `IValidation` is returned; for `isClone`
		 * `null` is returned when the source fails validation.
		 */
		clone(): any {
			const Ctor = this.constructor as any;
			const out = cloneFn(this);
			if (variant === "validateClone") return out;
			if (out == null) return out;
			return new Ctor(out);
		}
	};
}

export { Clonable };
