import typia, { reflect } from "typia";

// ---------------------------------------------------------------------------
// Lifecycle hooks — the middleware layer every capacity plugs into instead of
// owning the constructor or the `update` method.
// ---------------------------------------------------------------------------
// Capacities must NOT wrap the constructor or re-implement `update` themselves
// (that is how they used to conflict). Instead each capacity contributes
// *middleware* that the single unified constructor / `update` (in
// `defineModel`) invokes at well-defined points:
//
//   onInit      — runs on the RAW input, BEFORE `classify`. May transform /
//                 normalise the data (return the new data; a falsy return keeps
//                 the input). Runs on BOTH construction and update.
//   onConstruct — runs on the freshly-assigned instance at CONSTRUCTION time,
//                 AFTER `classify` + `Object.assign`, BEFORE freeze. Used for
//                 construction-time validation (e.g. Validatable's `onNew`).
//   onUpdate    — runs on the (merged) data at UPDATE time. For a MUTABLE model
//                 (`update` patches `this` in place) it runs on the merged
//                 snapshot BEFORE commit; for an IMMUTABLE model (`Immutable`
//                 capacity overrides `update` to reconstruct) it runs inside the
//                 reconstructed constructor. Used for update-time validation
//                 (e.g. Validatable's `onUpdate`).
//
// Because the hooks are a flat list shared by every capacity, there is exactly
// ONE constructor and ONE `update` — capacities only contribute behaviour.

/**
 * Phase marker smuggled through the constructor argument so the unified
 * constructor can tell a *reconstruction* (from `Immutable`'s `update`) apart
 * from a *fresh* construction — without a separate code path / public flag.
 *
 * It is a non-enumerable symbol deleted by the constructor before `classify`
 * sees the data. It is declared here (not in `defineModel`) so the `Immutable`
 * capacity — defined in a separate module — can set it when it reconstructs via
 * `update()`.
 */
export const UPDATE_PHASE = Symbol("model.updatePhase");

/** The three lifecycle phases a hook may register against. */
export type LifecyclePhase = "onInit" | "onConstruct" | "onUpdate";

/** A lifecycle middleware. Receives the current target (raw data for `onInit`,
 *  the instance for `onConstruct`/`onUpdate`) and may transform/validate it,
 *  returning the (possibly new) value, or throw to reject. */
export type LifecycleHook = (target: any) => any;

/** The registry shape hung off every composed class as a static `hooks`. */
export interface LifecycleHooks {
	onInit: LifecycleHook[];
	onConstruct: LifecycleHook[];
	onUpdate: LifecycleHook[];
}

/** Fresh, empty hook registry. */
export function emptyHooks(): LifecycleHooks {
	return { onInit: [], onConstruct: [], onUpdate: [] };
}

/**
 * Register a lifecycle hook onto a class (creating the registry if needed).
 * Safe to call during composition (when a capacity function runs) — it mutates
 * the shared registry that the unified constructor / `update` will read.
 */
export function addLifecycleHook(
	Base: any,
	phase: LifecyclePhase,
	fn: LifecycleHook,
): void {
	if (!Base.hooks) Base.hooks = emptyHooks();
	Base.hooks[phase].push(fn);
}

/**
 * Capable
 * - has capacities.
 *
 * This must be the before any other capacity you want to track
 * in the chain, ideally the first one after your model class.
 *
 * It ALSO paves the lifecycle-hook registry (`hooks`) that every other
 * capacity pushes middleware into, and that the unified constructor / `update`
 * (in `defineModel`) iterates. Because Capable is always prepended and run
 * first, the registry exists before any other capacity registers a hook.
 *
 * @alis Constructable
 */
function Capable<TBase extends CapacityConstructor>(Base: TBase) {
	const capacities = new Set<string>(["Capable"]);
	Base.prototype.capacities = capacities;
	Base.prototype.addCapacity = (capacity: string) => {
		capacities.add(capacity);
	};
	// Pave the lifecycle-hook registry (idempotent across re-composition).
	if (!(Base as any).hooks) (Base as any).hooks = emptyHooks();
	return Base;
}

type CapacityConstructor<T = {}> = new (...args: any[]) => T;

export { Capable, type CapacityConstructor };
