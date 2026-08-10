import type { CapacityConstructor } from "./capable";
import { Capable } from "./capable";
import { JsonSerialisable } from "./json-serialisable";
import { ProtobufEncodable } from "./protobuf-encodable";
import { Immutable } from "./immutable";
import type { SchemaModule } from "./schema-module";

/**
 * `composeCapabilities` — the declarative capacity-chaining helper.
 *
 * A model declares the capacities it wants as a flat list of capacity
 * references (the constructor, or its exported name); this folds them onto a
 * base class and returns the PROCESSED class ("caps"). The model then
 * `extends` that result. No more hand-written `Fn(G(H(base, …), …))` nesting.
 *
 * The model also hands in ONE shared {@link SchemaModule} — the fixed bundle of
 * every typia binding the model bound concretely at its own site (where the
 * schema type is real). Each capacity pulls ONLY the slice it needs out of that
 * module and ignores the rest. So the declaration is just *intent* (which
 * capacities), and the schema machinery lives in exactly one place.
 *
 * Two equivalent declarative forms:
 *
 *   // ARRAY form — capacity refs (functions) directly:
 *   composeCapabilities(UserModel, [JsonSerialisable, ProtobufEncodable], schemaModule);
 *
 *   // OBJECT form — capacity by exported NAME (presence only):
 *   composeCapabilities(UserModel, { JsonSerialisable: true, ProtobufEncodable: true }, schemaModule);
 *
 * `Capable` is ALWAYS applied first (it paves the capacity registry that every
 * other capacity registers into) and exactly once, so ordering is correct no
 * matter what the model declares — and a model can never forget to put
 * `Capable` first.
 *
 * How capacities compose: some capacities return a NEW subclass
 * (`JsonSerialisable`, `Immutable`); others mutate `Base` **in place** and
 * return the same constructor (`Capable`, `ProtobufEncodable`). Both fold
 * identically under left-to-right reduction, because every capacity has the
 * uniform shape `(base, schemaModule) => adornedClass`.
 */

/**
 * The uniform capacity shape: `(base, schemaModule) => adornedClass`.
 * `schemaModule` is the fixed bundle of already-bound typia functions the model
 * hands in (typia can't be invoked generically inside a mixin, so the model
 * binds it and the capacity merely consumes its slice).
 */
type AnyCapacity = (base: any, schemaModule?: any) => any;

/** A bare capacity reference: the constructor itself, or its exported name. */
export type CapacityRef = AnyCapacity | string;

/** Array declarative form: an ordered list of {@link CapacityRef}. */
export type CapacityList = readonly CapacityRef[];

/** Object declarative form: `{ CapacityName: true }` (presence only). */
export type CapacityObject = Record<string, boolean | undefined>;

/** Either declarative form. */
export type CapacityDeclaration = CapacityList | CapacityObject;

/**
 * Registry for the OBJECT form — maps a capacity's exported name to its
 * function so a model can write `{ JsonSerialisable: true }` without importing
 * the function. The ARRAY form passes functions directly and needs no registry.
 *
 * Populated from the concrete mixins below; register additional capacities
 * (e.g. `Validatable`, `Identifiable`) with {@link registerCapacity} if you add
 * them and want them available by name.
 */
const REGISTRY = new Map<string, AnyCapacity>();

/** Register (or override) a capacity under `name` for object-form resolution. */
export function registerCapacity(name: string, fn: AnyCapacity): void {
	REGISTRY.set(name, fn);
}

for (const [name, fn] of [
	["Capable", Capable],
	["JsonSerialisable", JsonSerialisable],
	["ProtobufEncodable", ProtobufEncodable],
	["Immutable", Immutable],
] as const) {
	registerCapacity(name, fn as AnyCapacity);
}

// ---------------------------------------------------------------------------
// Type-level folding of the ARRAY form (preserves the adorned class shape).
// ---------------------------------------------------------------------------
/** Apply one ref to base `B`, resolving the resulting class type. */
type ApplySpec<B extends CapacityConstructor, S> = S extends (
	base: B,
	...rest: any[]
) => infer R
	? R
	: B;

/** Left-to-right fold of a ref tuple into the composed class type. */
type Composed<
	B extends CapacityConstructor,
	S extends readonly any[],
> = S extends readonly [infer Head, ...infer Tail]
	? Tail extends readonly any[]
		? Composed<ApplySpec<B, Head> & CapacityConstructor, Tail>
		: ApplySpec<B, Head>
	: B;

// ---------------------------------------------------------------------------
// Runtime resolution + folding.
// ---------------------------------------------------------------------------
/** Resolve a single capacity ref (function or registry name) to its function. */
function resolveRef(ref: CapacityRef): AnyCapacity {
	if (typeof ref === "string") {
		const fn = REGISTRY.get(ref);
		if (!fn) {
			throw new Error(
				`composeCapabilities: unknown capacity "${ref}". ` +
					`Known: ${[...REGISTRY.keys()].join(", ")}. ` +
					`Use registerCapacity(...) or the array form with the function.`,
			);
		}
		return fn;
	}
	return ref as AnyCapacity;
}

/**
 * Normalise the declaration into an ordered list of `[fn, schemaModule]`
 * tuples ready to fold. `Capable` is always prepended (and de-duplicated) so it
 * runs first regardless of what the model declared.
 */
function normalize(
	declaration: CapacityDeclaration | undefined,
	schemaModule: SchemaModule<any>,
): [AnyCapacity, SchemaModule<any>][] {
	const resolved: AnyCapacity[] = !declaration
		? []
		: Array.isArray(declaration)
			? declaration.map(resolveRef)
			: Object.keys(declaration).map((name) => resolveRef(name));

	// Capable must run first and exactly once. Drop any explicit Capable from
	// the user list (we prepend our own), so ordering is always correct — and
	// Capable is always applied (even when the model declares no capacities).
	const withoutCapable = resolved.filter((fn) => fn !== Capable);

	return [Capable, ...withoutCapable].map(
		(fn) => [fn, schemaModule] as [AnyCapacity, SchemaModule<any>],
	);
}

export function composeCapabilities<
	B extends CapacityConstructor,
	const S extends CapacityList,
>(base: B, specs: S, schemaModule: SchemaModule<any>): Composed<B, S>;
export function composeCapabilities<B extends CapacityConstructor>(
	base: B,
	specs: CapacityObject | undefined,
	schemaModule: SchemaModule<any>,
): B;
/** Broad overload — accepts the union form (e.g. when read from a config object). */
export function composeCapabilities<B extends CapacityConstructor>(
	base: B,
	specs: CapacityDeclaration | undefined,
	schemaModule: SchemaModule<any>,
): B;
export function composeCapabilities<B extends CapacityConstructor>(
	base: B,
	specs: CapacityDeclaration | undefined,
	schemaModule: SchemaModule<any>,
): B {
	return normalize(specs, schemaModule).reduce<B>((acc, [fn, mod]) => {
		return fn(acc, mod) as B;
	}, base);
}
