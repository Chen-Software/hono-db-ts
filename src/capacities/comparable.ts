import type { CapacityConstructor } from "./capable";
import type { ComposeContext } from "./compose";
import type { SchemaModule } from "./schema-module";

/**
 * ComparableSchema — the type-level capacity marker. A schema that "is
 * Comparable" declares it can be compared for equality and ordering against
 * another value of the same type. Pure marker (like `IdentifiableSchema`); the
 * runtime behaviour lives in the {@link Comparable} mixin below, which pulls
 * the concretely-bound `equals` / `less` / `more` functions out of the model's
 * {@link SchemaModule}.
 *
 * @template T - the comparable type.
 */
interface ComparableSchema<T> {
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
 * - `validated` — when `true`, EVERY compare function (`equals` / `less` /
 *   `more`) first validates both operands via the model's validator
 *   (`mod.validate`); if either operand is invalid, the function returns
 *   `false`. This makes the whole comparison "validator-aware": it rejects
 *   invalid data that merely *looks* comparable, mirroring how `Clonable`
 *   defaults to the validated clone when the validator capacity is on.
 *   Defaults to `true` when the `Validatable` capacity is also declared,
 *   `false` otherwise. Set it explicitly to opt in or out regardless of
 *   `Validatable`.
 */
export interface ComparableOptions {
	validated?: boolean;
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
 * **Validator-aware (`if has validator capacity enabled`).** When the model
 * also declares `Validatable`, every compare function defaults to the
 * `validated` mode and gates on the validator before comparing; set
 * `{ validated: false }` to opt out, or `{ validated: true }` to force it on
 * even without `Validatable`.
 *
 * @example
 * const UserModel = defineModel<UserSchema>({
 *   schemaName: "UserSchema",
 *   schemaModule: UserSchemaModule, // binds equals / less / more
 *   capacities: [JsonSerialisable, Validatable, { capacity: Comparable }],
 * });
 * User.equals(a, b);      // → boolean (validated, since Validatable present)
 * User.less(a, b);        // → boolean (validated)
 * new User(a).more(b);    // → boolean (validated)
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

	// Validator-aware comparison: default the `validated` mode ON when the
	// validator capacity is also declared (mirrors Clonable's validator-driven
	// default); an explicit option always wins.
	const validated =
		options.validated ?? (ctx?.has("Validatable") ?? false);
	const validateFn = validated ? mod.validate : undefined;

	// Wrap a structural compare fn so invalid operands short-circuit to
	// `false`. When `validateFn` is absent (plain mode) the wrapper is a no-op.
	const guard =
		(fn: (x: any, y: any) => boolean) =>
		(x: unknown, y: unknown): boolean => {
			if (validateFn) {
				// Reject invalid operands outright — they are not "comparable"
				// under a validator-aware comparison, even if they happen to
				// look alike.
				if (!validateFn(x).success || !validateFn(y).success) return false;
			}
			return fn(x, y);
		};

	const eq = guard(eqFn);
	const less = guard(lessFn);
	const more = guard(moreFn);

	Base.prototype.capacities && Base.prototype.addCapacity("Comparable");

	return class extends Base {
		/** Equality (validator-aware when `Validatable` is also declared). */
		static equals = eq;
		/** Strict lexicographic less-than (validator-aware). */
		static less = less;
		/** Strict lexicographic greater-than (= `less(y, x)`, validator-aware). */
		static more = more;

		/** Instance equality against `y`. */
		equals(y: any): boolean {
			return eq(this, y);
		}
		/** Instance less-than against `y`. */
		less(y: any): boolean {
			return less(this, y);
		}
		/** Instance greater-than against `y`. */
		more(y: any): boolean {
			return more(this, y);
		}
	};
}

export { Comparable, type ComparableSchema };
