import { BusRegistry, type EventBus } from "../services/event-bus";
import type { CapacityConstructor } from "./capable";

export interface ReactiveReaction {
	/** Topic to subscribe to on the bus. */
	topic: string;
	/** Handler: a method NAME on the model class, or a `(event, Ctor) => …` fn. */
	handler: string | ((event: any, Ctor: any) => void | Promise<void>);
}

export interface ReactiveOptions {
	/**
	 * Bus to subscribe through. A `EventBus` instance or a NAME registered in
	 * `BusRegistry`. Omit to use `BusRegistry.default()`.
	 */
	bus?: EventBus | string;
	/**
	 * Class-level reactions: subscribe `handler` to `topic` for THIS model.
	 * This is the inversion of `Triggerable`'s emitter-centric `after(...)`:
	 * the SUBSCRIBER declares what it reacts to, not the source.
	 */
	reactions?: ReactiveReaction[];
}

/**
 * Reactive — subscriber-centric event wiring (a CAPACITY, not the bus).
 *
 * It declares that this model REACTS to named bus topics. The wiring sits on
 * the subscriber (this model), so the model never imports its trigger source —
 * it just names a topic + handler. The handler is invoked with `(event, Ctor)`
 * and may be async (the bus does not await it).
 *
 * Contrast with `Triggerable`:
 *   - `Triggerable.after("Update", fn)`  — emitter-centric; you must wire the
 *     effect onto the model that fires `update`. Source-coupled, in-process.
 *   - `Reactive({ topic, handler })`    — subscriber-centric; the model reacts
 *     to a topic that ANY producer (in-process, remote, scheduled) may publish.
 *
 * Also adds an instance `subscribe(topic, fn)` for per-instance reactions — e.g.
 * a live model listening for remote patches about its own id (another tab, a
 * CRDT sync). Returns an unsubscribe function.
 */
function Reactive<TBase extends CapacityConstructor>(
	Base: TBase,
	_mod?: any,
	options: ReactiveOptions = {},
	_ctx?: any,
): TBase {
	Base.prototype.capacities && Base.prototype.addCapacity?.("Reactive");

	const bus: EventBus = options.bus
		? BusRegistry.resolve(options.bus)
		: BusRegistry.default();
	const reactions = options.reactions ?? [];

	// Class-level subscriptions — wired once per composed class.
	if (!(Base as any).__reactiveWired) {
		(Base as any).__reactiveWired = true;
		for (const r of reactions) {
			const fn =
				typeof r.handler === "string"
					? (event: any) => (Base as any)[r.handler as string]?.(event, Base)
					: (event: any) => r.handler(event, Base);
			bus.subscribe(r.topic, fn);
		}
	}

	return class extends (Base as any) {
		/** Subscribe THIS instance to a topic (returns an unsubscribe fn). */
		subscribe(topic: string, handler: (event: any) => void): () => void {
			return bus.subscribe(topic, handler);
		}
	} as TBase;
}

export { Reactive };
