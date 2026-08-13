import type {
	CapacityComposer,
	CapacityOptions,
	ComposeContext,
} from "./compose";
import type { SchemaModule } from "./schema-module";

/** Per-instance compare API a `Comparable` model exposes. */
export interface ComparableInstance<T = unknown> {
	/** Structural deep-equality against `other`. */
	equals(other: T): boolean;
	/** Strict-less (type-directed lexicographic) against `other`. */
	less(other: T): boolean;
	/** Strict-greater (inverse of `less`) against `other`. */
	more(other: T): boolean;
}

/** Static compare API a `Comparable` model exposes. */
export interface ComparableStatic<T = unknown> {
	equals: (x: T, y: T) => boolean;
	less: (x: T, y: T) => boolean;
	more: (x: T, y: T) => boolean;
}

/**
 * Options for the {@link Comparable} mixin. When `validated` is left unset, the
 * compare functions validate their operands IFF `Validatable` is also declared
 * (so comparability respects the model's validity contract by default). Pass
 * `{ validated: false }` to opt out of the validity gate even when `Validatable`
 * is present.
 */
export interface ComparableOptions {
	/** Gate operands through the model's `is` validator. Default: auto. */
	validated?: boolean;
}

/**
 * `Comparable` — the CAPACITY that makes a model comparable.
 *
 * It consumes the compare slice (`equals` / `less` / `more`) from the model's
 * {@link SchemaModule} and exposes it as three entry points, both statically
 * (`M.equals(x, y)`) and on instances (`inst.equals(other)`), so the SAME
 * order/equality semantics are available from either side of the model
 * boundary.
 *
 * Validator-awareness (driven by `options.validated` and the presence of
 * `Validatable`):
 *
 *  - when validated, any operand that fails the model's `is` validator makes the
 *    comparison `false` (you cannot meaningfully compare malformed data).
 *  - when NOT validated (no `Validatable`, or `{ validated: false }`), the
 *    comparison is purely structural — it always delegates to the typia function,
 *    even on invalid data.
 *
 * This is exactly the "decide whether to use them, or ignore them" split the
 * architecture is built around: `Comparable` reads only the compare slice and
 * leaves everything else in the module untouched.
 */
export function Comparable<TBase extends CapacityComposer>(
	Base: TBase,
	schemaModule: SchemaModule<any>,
	options?: CapacityOptions,
	ctx?: ComposeContext,
): TBase & ComparableStatic & ComparableInstance {
	const hasValidatable = ctx?.has("Validatable") ?? false;
	const wantValidate = (options?.["validated"] as boolean | undefined) ?? true;
	const validated = wantValidate && hasValidatable;
	const guard = (x: any) => !validated || schemaModule.is(x);

	Base.prototype.capacities && Base.prototype.addCapacity("Comparable");

	return class extends (Base as any) {
		static equals = (x: any, y: any) =>
			guard(x) && guard(y) ? schemaModule.equals(x, y) : false;
		static less = (x: any, y: any) =>
			guard(x) && guard(y) ? schemaModule.less(x, y) : false;
		static more = (x: any, y: any) =>
			guard(x) && guard(y) ? schemaModule.more(x, y) : false;

		/** Structural deep-equality against `other`. */
		equals(other: any) {
			return (this.constructor as unknown as ComparableStatic).equals(
				this,
				other,
			);
		}
		/** Strict-less against `other`. */
		less(other: any) {
			return (this.constructor as unknown as ComparableStatic).less(
				this,
				other,
			);
		}
		/** Strict-greater against `other`. */
		more(other: any) {
			return (this.constructor as unknown as ComparableStatic).more(
				this,
				other,
			);
		}
	} as unknown as TBase & ComparableStatic & ComparableInstance;
}
