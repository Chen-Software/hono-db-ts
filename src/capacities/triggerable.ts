// ---------------------------------------------------------------------------
// Triggerable — the single foundation capacity. It owns BOTH:
//   1. the capability registry (`capacities` Set + `addCapacity`), formerly
//      `Capable`'s job, and
//   2. the lifecycle (middleware) + event (signal) surface.
//
// It is always composed FIRST (and exactly once) by `composeCapabilities`, so
// the registry exists for every model — `Validatable`, `Referencible`, etc.
// gate their self-registration on `Base.prototype.capacities` existing. With
// `Capable` folded in, the guard idiom (`Base.prototype.capacities && …`)
// now reads "is the foundation present?", which is exactly its intent.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Lifecycle phases (MIDDLEWARE — run DURING an operation; may transform data or
// throw to REJECT the operation). Synchronous by contract.
// ---------------------------------------------------------------------------
import type { SchemaModule } from "./schema-module";

export type LifecyclePhase = "onInit" | "onConstruct" | "onUpdate" | "onDelete";

/** A lifecycle middleware. Receives the current target and may transform /
 *  validate it, returning the (possibly new) value, or throw to reject. */
export type LifecycleHook = (target: any) => any;

/** The registry shape hung off every composed class as a static `hooks`. */
export interface LifecycleHooks {
	onInit: LifecycleHook[];
	onConstruct: LifecycleHook[];
	onUpdate: LifecycleHook[];
	onDelete: LifecycleHook[];
}

/** Fresh, empty hook registry. */
export function emptyHooks(): LifecycleHooks {
	return { onInit: [], onConstruct: [], onUpdate: [], onDelete: [] };
}

/** Register lifecycle middleware onto a class (creating the registry if needed). */
export function addLifecycleHook(
	Base: any,
	phase: LifecyclePhase,
	fn: LifecycleHook,
): void {
	if (!Base.hooks) Base.hooks = emptyHooks();
	Base.hooks[phase].push(fn);
}

/**
 * Phase marker smuggled through the constructor argument so the unified
 * constructor can tell a *reconstruction* (from `Immutable`'s `update`) apart
 * from a *fresh* construction — without a separate code path / public flag.
 */
export const UPDATE_PHASE = Symbol("model.updatePhase");

// ---------------------------------------------------------------------------
// Events (SIGNALS — emitted at lifecycle boundaries; notification only, may be
// async; subscribers CANNOT abort the operation). This is the seam a future
// `Persistable` (writes a tombstone / row) or `Derivable` (re-materialises a
// cached/derived attribute) hangs off — without the model knowing about them.
// ---------------------------------------------------------------------------
export type ModelEvent =
	| "beforeUpdate"
	| "afterUpdate"
	| "beforeDelete"
	| "afterDelete"
	| "beforePersist"
	| "afterPersist";

/** The stem accepted by `before` / `after` (e.g. `"Update"` -> `"beforeUpdate"`). */
export type EventStem = "Update" | "Delete" | "Persist";

/** An event subscriber. May be async; the emitter does not await it inline. */
export type EventListener = (payload: any) => void | Promise<void>;

/** The subscriber registry hung off every composed class as `listeners`. */
export interface EventListeners {
	[event: string]: EventListener[];
}

export function emptyListeners(): EventListeners {
	return {};
}

/**
 * Triggerable — the foundation. Paves the capability registry and the
 * lifecycle/event registries, then adds the public event API to the adorned
 * class. Always composed (right after nothing — it IS first) so the registry
 * exists for every model.
 *
 * Public API it adds to the adorned class:
 *   prototype capacities   — the Set of applied capacity names (foundation seed)
 *   prototype addCapacity  — register a capacity name into that Set
 *   static hooks           — the middleware registry (paved; capacities push into it)
 *   static listeners       — the event subscriber registry
 *   static addHook(phase, fn)        — register lifecycle middleware
 *   static on(event, fn)             — subscribe to an event (returns unsubscribe)
 *   static before(stem, fn)          — subscribe to the `before*` form
 *   static after(stem, fn)           — subscribe to the `after*` form
 *   static emit(event, payload)      — dispatch to subscribers (returns a Promise)
 */
function Triggerable<TBase extends CapacityComposer>(
	Base: TBase,
	schemaModule?: SchemaModule<any>,
) {
	// --- Foundation: capability registry (formerly `Capable`) ---
	// Pave idempotently. If a registry already exists (re-composition / a class
	// already adorned), just record this capacity; otherwise seed it.
	if (!Base.prototype.capacities) {
		Base.prototype.capacities = new Set<string>(["Triggerable"]);
		Base.prototype.addCapacity = (capacity: string) => {
			Base.prototype.capacities.add(capacity);
		};
	} else {
		Base.prototype.addCapacity?.("Triggerable");
	}

	// Pave the schema module onto the prototype so every downstream capacity
	// (`JsonSerialisable`, `Clonable`, `Comparable`, `Randomisable`, …) can pull
	// its slice via `Base.prototype.schemaModule`. This was `Capable`'s job
	// before the foundation was renamed `Triggerable`; capacities read the
	// prototype (not the `mod` arg), so the foundation must lay it down first.
	if (schemaModule) (Base.prototype as any).schemaModule = schemaModule;

	// Pave the lifecycle/event registries idempotently (in case of re-composition).
	if (!(Base as any).hooks) (Base as any).hooks = emptyHooks();
	if (!(Base as any).listeners) (Base as any).listeners = emptyListeners();

	return class extends Base {
		// Type-only assertions: `hooks` / `listeners` are paved onto `Base` at
		// runtime (above) for re-composition safety. `declare` tells TS they
		// exist on this class's static side WITHOUT emitting a field (which
		// `useDefineForClassFields` would otherwise shadow the paved runtime value).
		declare static hooks: LifecycleHooks;
		declare static listeners: EventListeners;

		/** Register lifecycle middleware (runs during construction/update/delete). */
		static addHook(phase: LifecyclePhase, fn: LifecycleHook): void {
			addLifecycleHook(this, phase, fn);
		}

		/** Subscribe to a model event. Returns an unsubscribe function. */
		static on(event: ModelEvent, fn: EventListener): () => void {
			if (!this.listeners[event]) this.listeners[event] = [];
			this.listeners[event].push(fn);
			return () => {
				this.listeners[event] = (this.listeners[event] ?? []).filter(
					(f) => f !== fn,
				);
			};
		}

		/** Subscribe to the `before*` form of a lifecycle event. */
		static before(stem: EventStem, fn: EventListener): () => void {
			return (this as any).on(`before${stem}` as ModelEvent, fn);
		}

		/** Subscribe to the `after*` form of a lifecycle event. */
		static after(stem: EventStem, fn: EventListener): () => void {
			return (this as any).on(`after${stem}` as ModelEvent, fn);
		}

		/**
		 * Dispatch an event to all subscribers. Fire-and-forget from the core
		 * operation's perspective (it does not block commit), but the Promise is
		 * returned so a caller that NEEDS ordering (e.g. `await persist`) can await.
		 */
		static emit(event: ModelEvent, payload: any): Promise<void> {
			const subs = this.listeners[event] ?? [];
			return Promise.all(subs.map((f) => f(payload))).then(() => undefined);
		}
	};
}

export { Triggerable };
