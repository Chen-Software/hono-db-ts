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
 */
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
	create(entity: T): void;

	/** Append a NEW version onto an existing id's history. */
	append(entity: T): void;

	/** Remove an id and its entire history. Returns true if it existed. */
	remove(id: string): boolean;

	/** The latest instance of every tracked id. */
	listLatest(): T[];
}

export function createVersionHistoryStore<
	T extends Identifiable<string> & Versioned,
>(): VersionHistoryStore<T> {
	const histories = new Map<string, T[]>();

	return {
		has: (id) => histories.has(id),

		latestOf: (id) => {
			const history = histories.get(id);
			if (!history || history.length === 0) return undefined;
			return history[history.length - 1];
		},

		historyOf: (id) => histories.get(id),

		create: (entity) => {
			histories.set(entity.id, [entity]);
		},

		append: (entity) => {
			const history = histories.get(entity.id);
			if (!history) {
				throw new Error(
					`VersionHistoryStore.append: no history for id "${entity.id}" — call create() first`,
				);
			}
			history.push(entity);
		},

		remove: (id) => histories.delete(id),

		listLatest: () =>
			Array.from(histories.values()).map((h) => h[h.length - 1]!),
	};
}
