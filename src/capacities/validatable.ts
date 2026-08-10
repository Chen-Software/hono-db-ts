import type { CapacityConstructor } from "./capable";
import { addLifecycleHook } from "./capable";
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
	| "assert-guard-equals"
	| "assert-guard-validate";

/** Which validator the lifecycle hooks (`onNew` / `onUpdate`) run. */
export type ValidationHookMode = "assert" | "validate" | "assertGuard";

/**
 * Which `classify` variant backs the model's construction-time classify.
 * - `"classify"`        — plain `createClassify` (no validation at all)
 * - `"assertClassify"`  — `createAssertClassify` (DEFAULT when Validatable is on; throws on invalid)
 * - `"validateClassify"`— `createValidateClassify` (collects errors, throws if any)
 */
export type ClassifyStrategy =
	| "classify"
	| "assertClassify"
	| "validateClassify";

/**
 * Options for the {@link Validatable} capacity.
 *
 * - `validate` / `assert` / `assertGuard` — pick which module validator backs
 *   each capacity method. Defaults map 1:1 to `"validate"` / `"assert"` /
 *   `"assertGuard"`. Override to a STRICTER variant, e.g.
 *   `{ validate: "validate-equals", assert: "assert-equals",
 *      assertGuard: "assert-guard-equals" }` to swap in the deep-equal
 *   checks. The SchemaModule must carry those keys (it does — see
 *   {@link SchemaModule}).
 * - `classify` — which `classify` variant the model's constructor uses. When
 *   Validatable is enabled this DEFAULTS to `"assertClassify"` (so construction
 *   validates), overriding the base model's plain `classify`. Set it to
 *   `"classify"` to explicitly DISABLE construction-time validation, or
 *   `"validateClassify"` to collect errors instead of throwing immediately.
 * - `onNew` — validator to run in the constructor on every `new X(data)`.
 * - `onUpdate` — validator to run on the update path (exposed as
 *   `static validateUpdate` / `assertUpdate` / `assertGuardUpdate` for the
 *   model's `update` to call).
 */
export interface ValidatableOptions {
	validate?: ValidatorKey;
	assert?: ValidatorKey;
	assertGuard?: ValidatorKey;
	classify?: ClassifyStrategy;
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
 *      assertGuard: "assert-guard-equals" }`
 * binds the deep-equal variants instead of the default structural ones. The
 * SchemaModule must carry those keys (it does).
 *
 * **Construction-time classify** — `classify` selects which `classify` variant
 * the model's constructor uses. When Validatable is enabled it DEFAULTS to
 * `"assertClassify"` (so `new X(data)` validates), overriding the base model's
 * plain `classify`. Set `classify: "classify"` to disable construction
 * validation, or `"validateClassify"` to collect errors instead. This is the
 * "validator overrides an unvalidated classify when enabled" behaviour — unless
 * explicitly disabled or changed via this option.
 *
 * **Lifecycle hooks** — `onNew` selects which validator runs on construction
 * and `onUpdate` selects which runs on the update path. Validatable does NOT
 * own the constructor or `update`; instead it registers an `onConstruct`
 * (for `onNew`) and/or `onUpdate` lifecycle hook — middleware that the unified
 * constructor / `update` (in `defineModel`) invokes automatically. Each is one
 * of `"assert" | "validate" | "assertGuard"`. So the SAME declarative config
 * governs both lifecycle events, with no capacity fighting over who controls
 * construction/update.
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
	const assertGuardKey = (options.assertGuard ??
		"assertGuard") as keyof typeof mod;

	const validateFn = mod[validateKey] as (input: unknown) => any;
	const assertFn = mod[assertKey] as (input: unknown) => any;
	const assertGuardFn = mod[assertGuardKey] as (input: unknown) => any;

	// Construction-time classify. When Validatable is enabled, the base model's
	// plain `classify` is OVERWRITTEN with the configured variant (default
	// `assertClassify`), so `new X(data)` validates by default unless the model
	// opts out via `classify: "classify"`. `validateClassify` returns an
	// `IValidation`, so we unwrap it (throw on failure, return the data).
	const classifyKey = (options.classify ??
		"assertClassify") as keyof typeof mod;
	const classifyRaw = mod[classifyKey] as (input: unknown) => any;
	const classifyFn = (input: unknown): any => {
		const r = classifyRaw(input);
		if (r && typeof r === "object" && "success" in r) {
			if (!r.success) {
				const msgs = (r.errors ?? []).map(
					(e: any) => `${e?.path ?? "$"}: expected ${e?.expected ?? "?"}`,
				);
				throw new Error(`Validatable.classify failed — ${msgs.join("; ")}`);
			}
			return r.data;
		}
		return r;
	};

	Base.prototype.capacities && Base.prototype.addCapacity("Validatable");

	// Resolve a hook's validator function from the module by mode name.
	const hookFn = (mode: ValidationHookMode | undefined) =>
		mode
			? (mod[mode as keyof typeof mod] as (input: unknown) => any)
			: undefined;

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

	// -----------------------------------------------------------------------
	// Lifecycle hooks — Validatable does NOT wrap the constructor or implement
	// `update`. It contributes VALIDATION MIDDLEWARE that the unified
	// constructor / `update` (in `defineModel`) invoke. This is what stops the
	// validator capacity from conflicting with Immutable's constructor transform
	// or with any other capacity: there is one constructor and one `update`,
	// and each capacity only registers a hook.
	// -----------------------------------------------------------------------
	// `onNew`    → onConstruct hook (runs at construction time).
	// `onUpdate` → onUpdate hook (runs only when `update()` is the entry point).
	addLifecycleHook(Base, "onConstruct", (inst: any) => enforce(onNew, inst));
	if (onUpdate) {
		addLifecycleHook(Base, "onUpdate", (inst: any) => enforce(onUpdate, inst));
	}

	return class extends Base {
		/**
		 * Construction-time classify — overrides the base model's plain
		 * `classify` with the configured variant (default `assertClassify`),
		 * so the constructor validates by default while Validatable is on.
		 */
		static classify = classifyFn;

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

		/**
		 * Update-guard statics — kept for API compatibility / direct use. They
		 * run the configured `onUpdate` validator (no-op if unset). The unified
		 * `update()` now runs the same validator automatically via the
		 * `onUpdate` lifecycle hook; these statics are a thin explicit surface.
		 */
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
	};
}

export { Validatable };
