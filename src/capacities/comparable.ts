import type { CapacityConstructor } from "./capable";
import type { ComposeContext } from "./compose";
import type { SchemaModule } from "./schema-module";

/**
 * Comparable — the type-level capacity marker. A schema that "is Comparable"
 * declares it can be compared for equality and ordering against another value
 * of the same type. Pure marker (like `IdentifiableSchema`); the runtime
 * behaviour lives in the {@link Comparable} mixin below, which pulls the
 * concretely-bound `equals` / `less` / `more` functions out of the model's
 * {@link SchemaModule}.
 *
 * @template T - the comparable type.
 */
interface Comparable<T> {
	/** Whether `x` and `y` are equal by structure. */
	equals(x: T, y: T): boolean;
	/** Whether `x` strictly precedes `y` (lexicographic). */
	less(x: T, y: T): boolean;
	/** Whether `x` strictly follows `y` (lexicographic). */
	more(x: T, y: T): boolean;
}

/**
 * Options for the {@link Comparable} capacity.
 *
 * - `equals` — how the `equals` method behaves:
 *   - `"validated"` (DEFAULT when the `Validatable` capacity is also declared)
 *     — both operands must first pass the model's validator (`mod.validate`);
 *     if either is invalid, `equals` returns `false`. This makes equality
 *     "validator-aware": it rejects invalid data that merely *looks* equal,
 *     mirroring how `Clonable` defaults to the validated clone when the
 *     validator capacity is on.
 *   - `"plain"` (DEFAULT otherwise) — pure structural equality via
 *     `mod.equals` (no validity precondition).
 *   An explicit `equals` option always wins over the validator-driven default.
 */
export interface ComparableOptions {
	equals?: "validated" | "plain";
}

/**
 * Comparable — equips a class with `equals` / `less` / `more`, driven entirely
 * by the {@link SchemaModule} the model handed to `defineModel` (typia can't be
 * invoked generically inside a mixin, so the model binds `equals` / `less` /
 * `more` and this capacity merely consumes its slice — exactly like
 * `Validatable` / `Clonable`).
 *
 * Adds to the adorned class:
 *   - `static equals(x, y)` / `static less(x, y)` / `static more(x, y)`
 *   - instance `equals(y)` / `less(y)` / `more(y)` — compare `this` against `y`.
 *
 * `more` is derived as `less(y, x)` because typia's `compare` namespace exposes
 * `createEquals` / `createLess` but no native `createGreater`; all three are
 * still bound in the {@link SchemaModule} so the contract stays complete.
 *
 * **Validator-aware equality (`if has validator capacity enabled`).** When the
 * model also declares `Validatable`, `equals` defaults to the `"validated"`
 * mode and gates on the validator before comparing; set `{ equals: "plain" }`
 * to opt out, or `{ equals: "validated" }` to force it on even without
 * `Validatable`. `less` / `more` stay pure structural ordering — validators
 * define *equality*, not *ordering*.
 *
 * @example
 * const UserModel = defineModel<UserSchema>({
 *   schemaName: "UserSchema",
 *   schemaModule: UserSchemaModule, // binds equals / less / more
 *   capacities: [JsonSerialisable, Validatable, { capacity: Comparable }],
 * });
 * User.equals(a, b);      // → boolean (validated, since Validatable present)
 * new User(a).less(b);    // → boolean
 * User.more(a, b);        // → boolean (= less(b, a))
 */
function Comparable<TBase extends CapacityConstructor>(
	Base: TBase,
	mod: SchemaModule<any>,
	options: ComparableOptions = {},
	ctx?: ComposeContext,
) {
	// Structural comparison cores, pulled from the schema module.
	const eqFn = mod.equals as (x: any, y: any) => boolean;
	const lessFn = mod.less as (x: any, y: any) => boolean;
	const moreFn = mod.more as (x: any, y: any) => boolean;

	// Validator-aware equality: default the "validated" mode ON when the
	// validator capacity is also declared (mirrors Clonable's validator-driven
	// default); an explicit option always wins.
	const validated =
		options.equals ?? (ctx?.has("Validatable") ? "validated" : "plain");
	const validateFn = validated === "validated" ? mod.validate : undefined;

	const equalsFn = (x: unknown, y: unknown): boolean => {
		if (validateFn) {
			// Reject invalid operands outright — they are not "equal" under a
			// validator-aware comparison, even if they happen to look alike.
			if (!validateFn(x).success || !validateFn(y).success) return false;
		}
		return eqFn(x, y);
	};

	Base.prototype.capacities && Base.prototype.addCapacity("Comparable");

	return class extends Base {
		/** Equality (validator-aware when `Validatable` is also declared). */
		static equals = equalsFn;
		/** Strict lexicographic less-than. */
		static less = lessFn;
		/** Strict lexicographic greater-than (= `less(y, x)`). */
		static more = moreFn;

		/** Instance equality against `y`. */
		equals(y: any): boolean {
			return equalsFn(this, y);
		}
		/** Instance less-than against `y`. */
		less(y: any): boolean {
			return lessFn(this, y);
		}
		/** Instance greater-than against `y`. */
		more(y: any): boolean {
			return moreFn(this, y);
		}
	};
}

export { Comparable, type Comparable };
