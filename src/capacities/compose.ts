import type { CapacityConstructor } from "./capable";
import { Capable } from "./capable";
import { Clonable } from "./clonable";
import { Comparable } from "./comparable";
import { Derivable } from "./derivable";
import { Immutable } from "./immutable";
import { JsonSerialisable } from "./json-serialisable";
import { Persistable } from "./persistable";
import { ProtobufEncodable } from "./protobuf-encodable";
import { Reactive } from "./reactive";
import type { SchemaModule } from "./schema-module";
import { Triggerable } from "./triggerable";
import { Validatable } from "./validatable";

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
 * uniform shape `(base, schemaModule, options?) => adornedClass`.
 */

/**
 * The uniform capacity shape: `(base, schemaModule, options?, ctx?) =>
 * adornedClass`. `schemaModule` is the fixed bundle of already-bound typia
 * functions the model hands in (typia can't be invoked generically inside a
 * mixin, so the model binds it and the capacity merely consumes its slice).
 * `options` is an optional per-capacity config bag (e.g.
 * {@link ValidatableOptions}) forwarded from the declarative entry. `ctx` is
 * the {@link ComposeContext} describing the WHOLE declaration (every capacity
 * the model named), so a capacity can react to the presence of *another*
 * capacity — e.g. `Clonable` defaults its clone to the validated `assertClone`
 * variant when `Validatable` is also declared.
 */
type AnyCapacity = (
	base: any,
	schemaModule?: any,
	options?: any,
	ctx?: ComposeContext,
) => any;

/**
 * Context handed to every capacity during composition. `has(name)` reports
 * whether a capacity (by its registered name) is part of the model's
 * declaration — letting one capacity adapt to another without a hard
 * dependency between them.
 */
export interface ComposeContext {
	has(name: string): boolean;
}

/** A bare capacity reference: the constructor itself, or its exported name. */
export type CapacityRef = AnyCapacity | string;

/**
 * Per-capacity options bag passed through to the capacity at compose time
 * (e.g. {@link ValidatableOptions}). Kept intentionally loose here; each
 * capacity narrows it to its own options interface.
 */
export type CapacityOptions = Record<string, unknown>;

/**
 * One entry in the ARRAY declarative form. Either a bare {@link CapacityRef},
 * or an object that names the capacity plus an options bag — used when a
 * capacity needs configuration (e.g. `Validatable`'s validator overrides and
 * lifecycle hooks):
 *
 *   [JsonSerialisable, { capacity: Validatable, options: { onNew: "assert" } }]
 */
export type CapacityEntry =
	| CapacityRef
	| { capacity: CapacityRef; options?: CapacityOptions };

/** Array declarative form: an ordered list of {@link CapacityEntry}. */
export type CapacityList = readonly CapacityEntry[];

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
	["Triggerable", Triggerable],
	["JsonSerialisable", JsonSerialisable],
	["ProtobufEncodable", ProtobufEncodable],
	["Immutable", Immutable],
	["Validatable", Validatable],
	["Clonable", Clonable],
	["Comparable", Comparable],
	["Persistable", Persistable],
	["Reactive", Reactive],
	["Derivable", Derivable],
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

/** Reverse-lookup a capacity's registered name from its function reference. */
function nameOf(fn: AnyCapacity): string | undefined {
	for (const [n, f] of REGISTRY) if (f === fn) return n;
	return undefined;
}

/**
 * Normalise the declaration into an ordered list of `[fn, schemaModule]`
 * tuples ready to fold. `Capable` is always prepended (and de-duplicated) so it
 * runs first regardless of what the model declared.
 */
/** Coerce a single array entry into `{ ref, options? }`. */
function normalizeEntry(item: unknown): {
	ref: CapacityRef;
	options?: CapacityOptions;
} {
	if (item && typeof item === "object" && "capacity" in (item as object)) {
		const e = item as { capacity: CapacityRef; options?: CapacityOptions };
		return { ref: e.capacity, options: e.options };
	}
	return { ref: item as CapacityRef };
}

/**
 * Normalise the declaration into an ordered list of `[fn, schemaModule,
 * options?]` tuples ready to fold. `Capable` is always prepended (and
 * de-duplicated) so it runs first regardless of what the model declared.
 */
function normalize(
	declaration: CapacityDeclaration | undefined,
	schemaModule: SchemaModule<any>,
): [AnyCapacity, SchemaModule<any>, CapacityOptions?, string?][] {
	const specs: { ref: CapacityRef; options?: CapacityOptions }[] = !declaration
		? []
		: Array.isArray(declaration)
			? declaration.map(normalizeEntry)
			: Object.keys(declaration).map((name) => ({ ref: name as CapacityRef }));

	// Capable + Triggerable form the foundation and must run first, each
	// exactly once. `Capable` paves the capacity registry; `Triggerable` paves
	// the lifecycle/event registries that `Validatable` / `Referencible` push
	// middleware into. Drop any explicit mention from the user list (we prepend
	// our own), so ordering is always correct and both are always applied.
	const foundation = new Set([Capable, Triggerable]);
	const withoutFoundation = specs.filter(
		(s) => !foundation.has(resolveRef(s.ref)),
	);
	const all: { ref: CapacityRef; options?: CapacityOptions }[] = [
		{ ref: Capable },
		{ ref: Triggerable },
		...withoutFoundation,
	];

	return all.map((s) => {
		const fn = resolveRef(s.ref);
		return [fn, schemaModule, s.options, nameOf(fn)] as [
			AnyCapacity,
			SchemaModule<any>,
			CapacityOptions?,
			string?,
		];
	});
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
	const entries = normalize(specs, schemaModule);
	// Build the declaration-wide context ONCE so every capacity can see which
	// other capacities are present (e.g. Clonable adapting to Validatable).
	const declaredNames = entries
		.map((e) => e[3])
		.filter((n): n is string => typeof n === "string");
	const ctx: ComposeContext = { has: (name) => declaredNames.includes(name) };

	return entries.reduce<B>((acc, [fn, mod, options]) => {
		return fn(acc, mod, options, ctx) as B;
	}, base);
}
