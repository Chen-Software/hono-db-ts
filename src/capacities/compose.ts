import {
	Clonable,
	type ClonableInstance,
	type ClonableStatic,
} from "./clonable";
import {
	Comparable,
	type ComparableInstance,
	type ComparableStatic,
} from "./comparable";
import { Connectable } from "./connectable";
import { Derivable } from "./derivable";
import {
	Hashable,
	type HashableInstance,
	type HashableStatic,
} from "./hashable";
import type { Identifiable } from "./identifiable";
import { Immutable } from "./immutable";
import { JsonSerialisable } from "./json-serialisable";
import { Meterable } from "./meterable";
import { Persistable } from "./persistable";
import { ProtobufEncodable } from "./protobuf-encodable";
import { Queriable } from "./queriable";
import { Randomisable } from "./randomisable";
import { Reactive } from "./reactive";
import type { Referencible } from "./referencible";
import type { SchemaModule } from "./schema-module";
import { Servable, type ServableStatic } from "./servable";
import { Siftable } from "./siftable";
import { SqlSerialisable } from "./sql-serialisable";
import type { Timestamped } from "./timestamped";
import { Triggerable } from "./triggerable";
import {
	Validatable,
	type ValidatableInstance,
	type ValidatableStatic,
} from "./validatable";
import { Versionable } from "./versionable";

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
 * `Triggerable` is ALWAYS applied first (it paves the capacity registry that
 * every other capacity registers into) and exactly once, so ordering is correct
 * no matter what the model declares — and a model can never forget to put
 * `Triggerable` first.
 *
 * How capacities compose: some capacities return a NEW subclass
 * (`JsonSerialisable`, `Immutable`, `Triggerable`); others mutate `Base`
 * **in place** and return the same constructor (`ProtobufEncodable`). Both fold
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
export type CapacityRef = CapacityFn | string;

/**
 * The precise union of every capacity *function* (as opposed to the loose
 * {@link AnyCapacity} used for runtime resolution). Using the precise function
 * types here (instead of `AnyCapacity`) lets the type-level fold
 * ({@link Composed}) identify each capacity by reference and surface its
 * instance/static API on the composed model — so a model inherits
 * `validate`/`assert`/`assertGuard` (Validatable), `hash`/`verify`/`address`
 * (Hashable), `clone` (Clonable), `equals`/`less`/`more` (Comparable), etc.
 * automatically, with no manual `declare` in the model class.
 */
export type CapacityFn =
	| typeof Triggerable
	| typeof JsonSerialisable
	| typeof ProtobufEncodable
	| typeof Immutable
	| typeof Validatable
	| typeof Clonable
	| typeof Comparable
	| typeof Persistable
	| typeof Reactive
	| typeof Derivable
	| typeof Connectable
	| typeof SqlSerialisable
	| typeof Versionable
	| typeof Hashable
	| typeof Randomisable
	| typeof Identifiable
	| typeof Timestamped
	| typeof Referencible
	| typeof Queriable
	| typeof Siftable
	| typeof Meterable
	| typeof Servable;

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
	["Connectable", Connectable],
	["SqlSerialisable", SqlSerialisable],
	["Versionable", Versionable],
	["Hashable", Hashable],
	["Randomisable", Randomisable],
	["Queriable", Queriable],
	["Siftable", Siftable],
	["Meterable", Meterable],
	["Servable", Servable],
] as const) {
	registerCapacity(name, fn as AnyCapacity);
}

/** Any constructor that a capacity can adorn. */
export type CapacityComposer<T = {}> = new (...args: any[]) => T;

// ---------------------------------------------------------------------------
// Type-level folding of the ARRAY form (preserves the adorned class shape).
// ---------------------------------------------------------------------------

/**
 * Map a single capacity reference (a function, or a `{ capacity }` object) to
 * the INSTANCE + STATIC API its mixin contributes to the adorned model.
 * Capacities that add no extra surface resolve to `unknown` (a no-op
 * intersection), so the fold stays total. This is what lets a model inherit
 * `hash`/`verify`/`address` (from `Hashable`), `validate`/`assert`/`assertGuard`
 * (from `Validatable`), `clone` (from `Clonable`), `equals`/`less`/`more` (from
 * `Comparable`), etc. automatically — without re-declaring them.
 */
type CapacityInstance<C> = C extends typeof Hashable
	? HashableInstance & HashableStatic
	: C extends typeof Validatable
		? ValidatableInstance & ValidatableStatic
		: C extends typeof Comparable
			? ComparableStatic & ComparableInstance
			: C extends typeof Clonable
				? ClonableStatic & ClonableInstance
				: C extends typeof Servable
					? ServableStatic
					: C extends { capacity: infer D }
						? CapacityInstance<D>
						: C extends string
							? unknown
							: unknown;

/** Left-to-right fold of a ref tuple into the composed class type. */
export type Composed<B extends CapacityComposer, S> = S extends readonly [
	infer Head,
	...infer Tail,
]
	? Tail extends readonly any[]
		? Composed<B, Tail> & CapacityInstance<Head>
		: B & CapacityInstance<Head>
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
 * tuples ready to fold. `Triggerable` is always prepended (and de-duplicated)
 * so it runs first regardless of what the model declared.
 */
/** Coerce a single array entry into `{ ref, options? }`. */
function normaliseEntry(item: unknown): {
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
 * options?]` tuples ready to fold. `Triggerable` is always prepended (and
 * de-duplicated) so it runs first regardless of what the model declared.
 */
function normalise(
	declaration: CapacityDeclaration | undefined,
	schemaModule: SchemaModule<any>,
): [AnyCapacity, SchemaModule<any>, CapacityOptions?, string?][] {
	const specs: { ref: CapacityRef; options?: CapacityOptions }[] = !declaration
		? []
		: Array.isArray(declaration)
			? declaration.map(normaliseEntry)
			: Object.keys(declaration).map((name) => ({ ref: name as CapacityRef }));

	// `Triggerable` is the single foundation: it paves BOTH the capacity
	// registry and the lifecycle/event registries every other capacity pushes
	// into. It must run first, exactly once. Drop any explicit mention from the
	// user list (we prepend our own), so ordering is always correct and it is
	// always applied.
	const foundation = new Set([Triggerable]);
	const withoutFoundation = specs.filter(
		(s) => !foundation.has(resolveRef(s.ref)),
	);
	const all: { ref: CapacityRef; options?: CapacityOptions }[] = [
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
	B extends CapacityComposer,
	const S extends CapacityList,
>(base: B, specs: S, schemaModule: SchemaModule<any>): Composed<B, S>;
export function composeCapabilities<B extends CapacityComposer>(
	base: B,
	specs: CapacityObject | undefined,
	schemaModule: SchemaModule<any>,
): B;
/** Broad overload — accepts the union form (e.g. when read from a config object). */
export function composeCapabilities<B extends CapacityComposer>(
	base: B,
	specs: CapacityDeclaration | undefined,
	schemaModule: SchemaModule<any>,
): B;
export function composeCapabilities<B extends CapacityComposer>(
	base: B,
	specs: CapacityDeclaration | undefined,
	schemaModule: SchemaModule<any>,
): B {
	const entries = normalise(specs, schemaModule);
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
