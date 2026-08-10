import typia from "typia";
import { type tags } from "typia";
import type { CapacityConstructor } from "./capable";

/**
 * Immutable
 * 
 * @description Every mutation causes the entity to reconstruct.
 *
 */
/**
 * `ImmutableSchema` — the type-level MARKER for the capacity.
 *
 * It is the empty object (`Record<never, never>`): a no-op in an intersection
 * at both runtime and the type level, but it reads as a deliberate contract in
 * `Versioned = ImmutableSchema & …` / `ContentAddressable = ImmutableSchema & …`.
 * Declared as a `type` rather than an `interface` so it stays a pure marker and
 * does not trip empty-interface lint. The runtime behaviour (freezing) lives in
 * the {@link Immutable} mixin function below.
 */
type ImmutableSchema = Record<never, never>;

function Immutable<TBase extends CapacityConstructor>(Base: TBase) {
	Base.prototype.capacities && Base.prototype.addCapacity("Immutable");
	// const mutable = typia.reflect.schema<Writable<TBase>>();
	// console.log(mutable);
	return class extends Base implements ImmutableSchema {
		constructor(...args: any[]) {
			super(...args);
			Object.freeze(this);
		}
	}
}

export { Immutable, type ImmutableSchema };

/**
 * Immutable — a capacity marking that instances are NEVER mutated in place.
 *
 * Every change to an Immutable entity produces a BRAND-NEW instance (typically
 * via a model's `update` method) that preserves the entity's identity (`id`)
 * while advancing its version. The prior instance is left untouched, which
 * keeps entities event-sourced, safe for audit / time-travel, and trivially
 * shareable without defensive copies.
 *
 * WHY THIS MATTERS FOR CONTENT-ADDRESSABILITY: a `ContentAddressable` entity
 * derives its `hash` from its content. If the content field could be mutated
 * without re-deriving `hash`, the address invariant would silently break — the
 * hash would no longer identify the content. Content-addressability therefore
 * *requires* immutability, which is why `ContentAddressable` extends
 * `Immutable`. The contract is enforced by the model's constructor/`update`
 * (reconstruction), not by any runtime state declared here.
 *
 * This is a MARKER type (`Record<never, never>`, exported as {@link ImmutableSchema})
 * is the empty object, a no-op in an intersection at runtime and at the type
 * level, but reads as a deliberate contract in
 * `Versioned = ImmutableSchema & …` / `ContentAddressable = ImmutableSchema & …`).
 * Declared as a `type` rather than an `interface` so it stays a pure marker and
 * does not trip empty-interface lint.
 *
 * THE CAPACITY ALSO OWNS the shared update vocabulary — `createUpdate`,
 * `createAssertUpdate`, `createValidateUpdate` and their `…ImmutableUpdate`
 * aliases. Because both `Versioned` and `ContentAddressable` *extend* this
 * marker, every entity wearing either capacity inherits the same
 * immutable-update machinery (composed with their own policy steps).
 */


// ---------------------------------------------------------------------------
// Type-level "is every member readonly?" introspection
// ---------------------------------------------------------------------------
// `readonly` is a compile-time-only modifier — there is no runtime reflection
// for it (short of Object.freeze, see `isImmutable`). So the contract that an
// *entity type* is fully immutable is expressed and checked at the type level
// here. `IsImmutable<T>` is `true` iff every property of `T` is declared
// `readonly`; `AssertImmutable<T>` turns that into a constraint that rejects a
// non-immutable `T` at the call site.

/** Strip `readonly` from every property — the writable view of `T`. */
export type Writable<T> = { -readonly [K in keyof T]: T[K] };

/** Structural equality that distinguishes `readonly` (assignability ignores it). */
export type Equal<X, Y> =
	(<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
		? true
		: false;

/** The set of keys whose property is declared `readonly`. */
export type ReadonlyKeys<T> = {
	[K in keyof T]-?: Equal<Pick<T, K>, Readonly<Pick<T, K>>> extends true
		? K
		: never;
}[keyof T];

/** The set of keys whose property is NOT declared `readonly`. */
export type MutableKeys<T> = Exclude<keyof T, ReadonlyKeys<T>>;

/**
 * Constraint helper: yields `T` when `T` is fully readonly, otherwise `never`
 * (so `T extends AssertImmutable<T>` fails to bind for a non-immutable type).
 *
 * @example
 * function rebuild<T extends AssertImmutable<T>>(data: T): T { ... }
 */
export type AssertImmutable<T> = IsImmutable<T> extends true ? T : never;

// ---------------------------------------------------------------------------
// Runtime immutability guard (the runtime analogue of `IsImmutable`)
// ---------------------------------------------------------------------------
// The compile-time `readonly` modifier is not observable at runtime, so the
// practical runtime guarantee is *freezing*: a frozen object cannot be mutated.
// `isImmutable` / `assertImmutable` check exactly that. They are meaningful for
// entities whose constructor does `Object.freeze(this)` (opt-in); for plain
// objects they report `false` until frozen.

/** Runtime check: is `value` an object that has been frozen? */
export function isImmutable(value: unknown): boolean {
	return typeof value === "object" && value !== null && Object.isFrozen(value);
}

/** Runtime guard: throws unless `value` is a frozen (immutable) object. */
export function assertImmutable(value: unknown): void {
	if (!isImmutable(value)) {
		throw new Error(
			"assertImmutable: value is not immutable (it is not Object.frozen). " +
				"Freeze instances in the model constructor to satisfy this guard.",
		);
	}
}

// ---------------------------------------------------------------------------
// Update generators — the shared immutable-update vocabulary
// ---------------------------------------------------------------------------
// Every generator below returns `(entity, patch) => newInstance`. The entity is
// NEVER mutated in place; that is the entire contract of the `Immutable`
// capacity. Model-specific policy (version bump, hash re-derivation, assertion)
// lives inside the `reconstruct` / `assert` / `validate` callbacks, so these
// primitives stay dead simple and reusable for *any* immutable shape.

/**
 * The base immutable-update combinator — the foundation every other update
 * helper (`createVersionedUpdate`, `createContentAddressing`, …) is built on.
 *
 * It MERGES `patch` into `entity` (shallow spread) and rebuilds a brand-new
 * instance through `reconstruct`. All model-specific policy lives inside
 * `reconstruct`.
 *
 * @example
 * const rebuild = (data: UserData) => User.from(data);
 * const updateUser = createUpdate(rebuild);
 * const next = updateUser(existing, { name: "Alicia" }); // new instance
 */
export function createUpdate<D, T>(reconstruct: (data: D) => T) {
	return (entity: D, patch: Partial<D>): T =>
		reconstruct({ ...entity, ...patch } as D);
}

/** Documenting alias of {@link createUpdate} (canonical "Immutable" naming). */
export const createImmutableUpdate = createUpdate;

/**
 * `createAssertUpdate` is the documenting twin of {@link createUpdate}: its
 * single callback `assert` already VALIDATES the merged result (e.g. a model's
 * `from`, which runs `typia.plain.assertClassify`) and throws on invalid input.
 * It is behaviourally identical to `createUpdate` — the name is the signal.
 *
 * @example
 * const updateUser = createAssertUpdate((d: UserData) => User.from(d));
 */
export function createAssertUpdate<D, T>(assert: (data: D) => T) {
	return createUpdate(assert);
}

/** Documenting alias of {@link createAssertUpdate} (canonical "Immutable" naming). */
export const createAssertImmutableUpdate = createAssertUpdate;

/**
 * `createValidateUpdate` is the *validate-before-reconstruct* variant: it runs a
 * `validate` callback (e.g. `typia.createValidate<D>()`) over the merged data,
 * and only calls `reconstruct` when validation succeeds — otherwise it throws
 * with the validation errors. Use it when an invalid patch must be rejected
 * with structured diagnostics rather than silently reconstructed.
 *
 * @example
 * const updateUser = createValidateUpdate(
 *   typia.createValidate<UserData>(),
 *   (d: UserData) => User.from(d),
 * );
 */
export function createValidateUpdate<D, T>(
	validate: (data: D) => typia.IValidation<D>,
	reconstruct: (data: D) => T,
) {
	return (entity: D, patch: Partial<D>): T => {
		const merged = { ...entity, ...patch } as D;
		const result = validate(merged);
		if (!result.success) {
			const paths = result.errors.map((e) => e.path).join(", ");
			throw new Error(`createValidateUpdate: invalid patch (${paths})`);
		}
		return reconstruct(merged);
	};
}

/** Documenting alias of {@link createValidateUpdate} (canonical "Immutable" naming). */
export const createValidateImmutableUpdate = createValidateUpdate;
