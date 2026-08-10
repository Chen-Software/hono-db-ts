import type { Identifiable } from "../capacities/identifiable";
import type { Versioned } from "../capacities/versioned";

/**
 * Append-only version-history store (in-memory).
 *
 * IMPORTANT — this is *service infrastructure*, NOT a "capacity" in the
 * project's sense. Capacities (`src/capacities/*`) are type-level interfaces
 * plus pure functions; they have no state. This store is the shared *runtime*
 * counterpart to the `Versioned` MODEL capacity:
 *
 *   - the `Versioned` capacity makes `entity.update(patch)` produce a NEW
 *     instance with the same `id` and a strictly-later `updated_at` (the
 *     version timestamp);
 *   - this store PERSISTS every such immutable instance so the full history is
 *     retained.
 *
 * The core invariant (owned by the model layer, not here): a modification
 * never mutates an existing instance — it mints a fresh one, and we push it.
 * Prior versions stay in the array (audit trail / time-travel), and `id` is
 * never reused or changed.
 *
 * Every `id` maps to an array of immutable instances ordered oldest -> newest.
 * Swap the in-memory `Map` for a real DB/ORM (with a `(id, updated_at)`
 * uniqueness constraint) when ready — the call sites stay identical.
 *
 * The store is ALSO the outbox. `onChange` surfaces a domain event atomically
 * with each write, so the application never performs a second, uncoordinated
 * event publish (which would be a dual-write with no transaction boundary).
 * For a git/SQL backend, the version row and the event row land in one commit /
 * transaction; the event is the same fact as the version, surfaced here.
 */
export type StoreChangeHandler<T> = (
	entity: T | undefined,
	event?: { topic: string; payload: unknown },
) => void;

export interface VersionHistoryStore<
	T extends Identifiable<string> & Versioned,
> {
	/** Whether any version exists for `id`. */
	has(id: string): boolean;

	/** Latest (newest) instance for `id`, or `undefined` if absent. */
	latestOf(id: string): T | undefined;

	/** Full ordered history for `id` (oldest -> newest), or `undefined`. */
	historyOf(id: string): T[] | undefined;

	/** Seed the history for a NEW id with its first (immutable) instance. */
	create(entity: T, event?: { topic: string; payload: unknown }): void;

	/** Append a NEW version onto an existing id's history. */
	append(entity: T, event?: { topic: string; payload: unknown }): void;

	/** Remove an id and its entire history. Returns true if it existed. */
	remove(id: string, event?: { topic: string; payload: unknown }): boolean;

	/** The latest instance of every tracked id. */
	listLatest(): T[];

	/**
	 * Subscribe to every write (create/append/remove), receiving the entity
	 * (or `undefined` for a remove) and the optional event. Returns an
	 * unsubscribe function. This is the outbox seam: the repository forwards
	 * these events to the domain-event bus, atomically with the write.
	 */
	onChange(handler: StoreChangeHandler<T>): () => void;
}

export function createVersionHistoryStore<
	T extends Identifiable<string> & Versioned,
>(): VersionHistoryStore<T> {
	const histories = new Map<string, T[]>();
	const handlers = new Set<StoreChangeHandler<T>>();

	const notify = (
		entity: T | undefined,
		event?: { topic: string; payload: unknown },
	) => {
		for (const h of [...handlers]) h(entity, event);
	};

	return {
		has: (id) => histories.has(id),

		latestOf: (id) => {
			const history = histories.get(id);
			if (!history || history.length === 0) return undefined;
			return history[history.length - 1];
		},

		historyOf: (id) => histories.get(id),

		create: (entity, event) => {
			histories.set(entity.id, [entity]);
			notify(entity, event);
		},

		append: (entity, event) => {
			const history = histories.get(entity.id);
			if (!history) {
				throw new Error(
					`VersionHistoryStore.append: no history for id "${entity.id}" — call create() first`,
				);
			}
			history.push(entity);
			notify(entity, event);
		},

		remove: (id, event) => {
			const existed = histories.delete(id);
			if (existed) notify(undefined, event);
			return existed;
		},

		listLatest: () =>
			Array.from(histories.values()).map((h) => h[h.length - 1]!),

		onChange: (handler) => {
			handlers.add(handler);
			return () => {
				handlers.delete(handler);
			};
		},
	};
}
