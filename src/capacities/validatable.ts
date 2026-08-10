import type { CapacityConstructor } from "./capable";
import type { SchemaModule } from "./schema-module";

/**
 * The set of validator functions a {@link SchemaModule} may expose that
 * `Validatable` can bind to its methods. These are the literal module keys
 * `Validatable` looks up — including the user's strict `*-equals` / `*-guard`
 * variants. Bind every one of them in the model's schema module so any of them
 * can be selected.
 */
export type ValidatorKey =
	| "validate"
	| "assert"
	| "assertGuard"
	| "validate-equals"
	| "assert-equals"
	| "assert-guard-validate";

/** Which validator the lifecycle hooks (`onNew` / `onUpdate`) run. */
export type ValidationHookMode = "assert" | "validate" | "assertGuard";

/**
 * Options for the {@link Validatable} capacity.
 *
 * - `validate` / `assert` / `assertGuard` — pick which module validator backs
 *   each capacity method. Defaults map 1:1 to `"validate"` / `"assert"` /
 *   `"assertGuard"`. Override to a STRICTER variant, e.g.
 *   `{ validate: "validate-equals", assert: "assert-equals",
 *      assertGuard: "assert-guard-validate" }` to swap in the deep-equal
 *   checks. The SchemaModule must carry those keys (it does — see
 *   {@link SchemaModule}).
 * - `onNew` — validator to run in the constructor on every `new X(data)`.
 * - `onUpdate` — validator to run on the update path (exposed as
 *   `static validateUpdate` / `assertUpdate` / `assertGuardUpdate` for the
 *   model's `update` to call).
 */
export interface ValidatableOptions {
	validate?: ValidatorKey;
	assert?: ValidatorKey;
	assertGuard?: ValidatorKey;
	onNew?: ValidationHookMode;
	onUpdate?: ValidationHookMode;
}

/**
 * Validatable — equips a class with typia validation, driven entirely by the
 * {@link SchemaModule} the model handed to `defineModel` (typia can't be
 * invoked generically inside a mixin, so the model binds it and this capacity
 * merely consumes its slice).
 *
 * Adds to the adorned class:
 *   - `static validate`    — `mod[options.validate ?? "validate"]`
 *   - `static assert`      — `mod[options.assert ?? "assert"]`
 *   - `static assertGuard` — `mod[options.assertGuard ?? "assertGuard"]`
 *   - instance `validate()` / `assert()` / `assertGuard()` mirrors
 *   - `static validateUpdate` / `assertUpdate` / `assertGuardUpdate` — run the
 *     configured `onUpdate` validator (no-op if `onUpdate` is unset)
 *
 * **Custom function overrides** — the options map lets a model pick a stricter
 * or different module validator for any method, e.g.
 *   `{ validate: "validate-equals", assert: "assert-equals",
 *      assertGuard: "assert-guard-validate" }`
 * binds the deep-equal variants instead of the default structural ones. The
 * SchemaModule must carry those keys (it does).
 *
 * **Lifecycle hooks** — `onNew` selects which validator runs on construction
 * (enforced in the constructor; throws on invalid data), and `onUpdate` selects
 * which validator runs on the model's update path via the `*Update` statics.
 * Each is one of `"assert" | "validate" | "assertGuard"`. So the SAME
 * declarative config governs both lifecycle events.
 *
 * @example
 * // In the model:
 * const UserModel = defineModel<UserSchema>({
 *   schemaName: "UserSchema",
 *   schemaModule: UserSchemaModule, // binds validate / assert / assertGuard / *-equals / *-guard
 *   capacities: [
 *     JsonSerialisable,
 *     ProtobufEncodable,
 *     { capacity: Validatable, options: {
 *         validate: "validate-equals",   // strict-equal validate
 *         onNew: "assert",               // assert on construction
 *         onUpdate: "validate",          // validate (collect errors) on update
 *       } },
 *   ],
 * });
 * User.validate(valid);        // → ValidationResult (strict-equal)
 * User.assert(bad);            // → throws
 * User.validateUpdate(patch);  // → throws if patch fails `validate`
 */
function Validatable<TBase extends CapacityConstructor>(
	Base: TBase,
	mod: SchemaModule<any>,
	options: ValidatableOptions = {},
) {
	const validateKey = (options.validate ?? "validate") as keyof typeof mod;
	const assertKey = (options.assert ?? "assert") as keyof typeof mod;
	const assertGuardKey = (options.assertGuard ?? "assertGuard") as keyof typeof mod;

	const validateFn = mod[validateKey] as (input: unknown) => any;
	const assertFn = mod[assertKey] as (input: unknown) => any;
	const assertGuardFn = mod[assertGuardKey] as (input: unknown) => any;

	Base.prototype.capacities && Base.prototype.addCapacity("Validatable");

	// Resolve a hook's validator function from the module by mode name.
	const hookFn = (mode: ValidationHookMode | undefined) =>
		mode ? (mod[mode as keyof typeof mod] as (input: unknown) => any) : undefined;

	const onNew = hookFn(options.onNew);
	const onUpdate = hookFn(options.onUpdate);

	/**
	 * Run a validator as a GUARD: throws on invalid for all three shapes.
	 *   - `validate` / `validate-equals` return `{ success, errors }` (non-throwing)
	 *     → we throw an aggregated error when `success` is false.
	 *   - `assert` / `assert-equals` throw themselves (typia TypeGuardError).
	 *   - `assertGuard` returns a boolean (`input is T`) → we throw when false.
	 */
	const enforce = (
		fn: ((input: unknown) => any) | undefined,
		data: unknown,
	) => {
		if (!fn) return;
		const r = fn(data);
		if (r && typeof r === "object" && "success" in r) {
			if (!r.success) {
				const msgs = (r.errors ?? []).map(
					(e: any) => `${e?.path ?? "$"}: expected ${e?.expected ?? "?"}`,
				);
				throw new Error(`Validatable: validation failed — ${msgs.join("; ")}`);
			}
			return;
		}
		if (r === false) {
			throw new Error("Validatable: assertGuard rejected the value");
		}
	};

	return class extends Base {
		/** Validate — returns `{ success, data | errors }` (non-throwing). */
		static validate = validateFn;

		/** Assert — throws on invalid, returns the data. */
		static assert = assertFn;

		/**
		 * Type guard — returns `true` when the value satisfies the schema and
		 * `false` otherwise. typia's `createAssertGuard` asserts (returns
		 * `undefined` and THROWS on invalid); we wrap it into a boolean guard so
		 * the static is ergonomic to call directly. (The lifecycle `enforce`
		 * uses the raw function so it still THROWS on invalid data.)
		 */
		static assertGuard = (input: unknown): boolean => {
			try {
				assertGuardFn(input);
				return true;
			} catch {
				return false;
			}
		};

		/** Update-guard (runs the configured `onUpdate` validator; no-op if unset). */
		static validateUpdate = (data: unknown) => enforce(onUpdate, data);
		static assertUpdate = (data: unknown) => enforce(onUpdate, data);
		static assertGuardUpdate = (data: unknown) => enforce(onUpdate, data);

		/** Instance mirrors of the static validators. */
		validate() {
			return (this.constructor as any).validate(this);
		}
		assert(): this {
			(this.constructor as any).assert(this);
			return this;
		}
		assertGuard(): boolean {
			return (this.constructor as any).assertGuard(this);
		}

		constructor(...args: any[]) {
			super(...args);
			// `onNew` guard — enforces validity on every construction call.
			// Validate `this` (the classified instance) rather than `args[0]`,
			// so a JSON-string constructor (handled upstream by JsonSerialisable)
			// is validated against its parsed form, not the raw string.
			enforce(onNew, this);
		}
	};
}

export { Validatable };
