/**
 * `EventBus` — the pub/sub backbone for reactive models.
 *
 * This is an APP-SERVICE, NOT a capacity. Models never touch a bus directly;
 * the `Reactive` capacity subscribes them to topics on a bus injected by name
 * (via `BusRegistry`). That keeps the trigger SOURCE opaque to the model: a
 * topic can be produced by an in-process `update`, a remote service, a CRDT
 * sync, a webhook, or a scheduled drain — the subscriber doesn't care where
 * the event came from. This is exactly the storage/repo abstraction via *push*
 * discussed earlier: the model reacts to a named stream instead of pulling
 * from a repository.
 */

/** A bus subscriber. May be async; the publisher does not await it inline. */
export type BusHandler = (payload: any) => void | Promise<void>;

export interface EventBus {
	/** Backend name (introspection / logging). */
	readonly name: string;
	/** Publish `payload` to `topic` (notifies current subscribers). */
	publish(topic: string, payload: any): void;
	/** Subscribe `handler` to `topic`; returns an unsubscribe function. */
	subscribe(topic: string, handler: BusHandler): () => void;
	/** Replay a durable topic's accumulated history to a late subscriber. */
	replay?(topic: string, handler: BusHandler): void;
}

/**
 * `InMemoryBus` — process-local reference implementation of {@link EventBus}.
 *
 * Optionally durable topics keep a rolling history so late subscribers can
 * `replay`, and `drain` can sweep accumulated "dirty" events on a schedule
 * (the "re-materialise derived state on the next scheduled job" pattern).
 */
export class InMemoryBus implements EventBus {
	readonly name: string;
	private subs = new Map<string, Set<BusHandler>>();
	private history = new Map<string, any[]>();
	private durable: Set<string>;

	constructor(name = "memory", opts?: { durableTopics?: string[] }) {
		this.name = name;
		this.durable = new Set(opts?.durableTopics ?? []);
	}

	publish(topic: string, payload: any): void {
		if (this.durable.has(topic)) {
			const h = this.history.get(topic) ?? [];
			h.push(payload);
			this.history.set(topic, h);
		}
		const set = this.subs.get(topic);
		if (set) for (const fn of [...set]) void fn(payload);
	}

	subscribe(topic: string, handler: BusHandler): () => void {
		let s = this.subs.get(topic);
		if (!s) {
			s = new Set();
			this.subs.set(topic, s);
		}
		s.add(handler);
		return () => {
			s!.delete(handler);
		};
	}

	replay(topic: string, handler: BusHandler): void {
		for (const p of this.history.get(topic) ?? []) void handler(p);
	}

	/**
	 * Scheduled drain — the "re-materialise on the next scheduled job" pattern.
	 * Accumulated events on a durable `topic` are swept on an interval; each
	 * pending payload is handed to `handler` once, then cleared. Returns a
	 * `stop()` function.
	 */
	drain(topic: string, handler: BusHandler, intervalMs: number): () => void {
		const id = setInterval(() => {
			const pending = this.history.get(topic);
			if (!pending || pending.length === 0) return;
			const batch = pending.splice(0, pending.length);
			for (const p of batch) void handler(p);
		}, intervalMs);
		return () => clearInterval(id);
	}
}

// ---------------------------------------------------------------------------
// `BusRegistry` — name -> EventBus, the dependency-injection seam (mirrors
// `StoreRegistry`). Models name a bus by string in `Reactive` / `Derivable`
// options; the registry resolves it. A process-wide default bus exists so a
// model can omit injection entirely and still be reactive (override per deploy).
// ---------------------------------------------------------------------------
const buses = new Map<string, EventBus>();
let def: EventBus | undefined;

export const BusRegistry = {
	register(name: string, bus: EventBus): void {
		buses.set(name, bus);
	},
	get(name: string): EventBus | undefined {
		return buses.get(name);
	},
	/** Set the process-wide default bus used when options omit `bus`. */
	setDefault(bus: EventBus): void {
		def = bus;
	},
	/** Resolve the default bus, creating an in-memory one on first use. */
	default(): EventBus {
		if (!def) def = new InMemoryBus("memory");
		return def;
	},
	/** Resolve a bus by instance or registered name. */
	resolve(bus: EventBus | string): EventBus {
		if (typeof bus !== "string") return bus;
		const b = buses.get(bus);
		if (!b) {
			throw new Error(
				`BusRegistry: no bus registered under "${bus}". ` +
					`Known: ${[...buses.keys()].join(", ") || "(none)"}.`,
			);
		}
		return b;
	},
};

export type { BusHandler, EventBus };
