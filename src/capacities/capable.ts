// ---------------------------------------------------------------------------
// Lifecycle + event machinery now lives in `triggerable.ts`. `Capable` is the
// pure foundation marker + capacity registry, always composed FIRST. We
// re-export the lifecycle surface here so existing importers (`base.ts`,
// `validatable.ts`) keep working unchanged.
// ---------------------------------------------------------------------------
export type {
	LifecyclePhase,
	LifecycleHook,
	LifecycleHooks,
	ModelEvent,
	EventListener,
	EventListeners,
	EventStem,
} from "./triggerable";

export {
	addLifecycleHook,
	emptyHooks,
	emptyListeners,
	UPDATE_PHASE,
} from "./triggerable";

/**
 * Capable — the foundation marker. Paves the `capacities` set on the prototype
 * and exposes `addCapacity`. It deliberately owns NO lifecycle logic (that moved
 * to `Triggerable`); it only marks a class as capacity-aware and tracks which
 * capacities are present.
 *
 * @alias Constructable
 */
function Capable<TBase extends CapacityConstructor>(Base: TBase) {
	const capacities = new Set<string>(["Capable"]);
	Base.prototype.capacities = capacities;
	Base.prototype.addCapacity = (capacity: string) => {
		capacities.add(capacity);
	};
	return Base;
}

type CapacityConstructor<T = {}> = new (...args: any[]) => T;

export { Capable, type CapacityConstructor };
