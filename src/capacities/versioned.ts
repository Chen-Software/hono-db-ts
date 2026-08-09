import { type tags } from "typia";
import type { Identifiable } from "./identifiable";

/**
 * Versioned marks an entity as an immutable, append-only instance of a logical
 * object identified by its `id`.
 *
 * The version discriminator is the `updated_at` timestamp: every modification
 * produces a NEW object with the same `id` and a *strictly later* `updated_at`.
 * Prior instances are never mutated, which keeps the entity event-sourced and
 * safe for audit / time-travel. `updated_at` therefore doubles as the version
 * identifier — lexicographic comparison of the ISO strings orders versions
 * chronologically, and equals `created_at` on the very first version.
 */
interface Versioned {
	/** Version timestamp. Strictly increases on every update; equals `created_at` on the first version. */
	updated_at: string & tags.Format<"date-time">;
}

// ---------------------------------------------------------------------------
// Version timestamp generator (shared by every Versioned entity)
// ---------------------------------------------------------------------------
// Produces an ISO-8601 `updated_at` that is strictly greater than `prev` (the
// previous version's timestamp) AND globally monotonic, so two versions are
// never collapsed onto the same instant even if updates land in the same
// millisecond. Fixed-length ISO strings compare chronologically as text.
let lastUpdatedAtMs = 0;
export function nextUpdatedAt(prev?: string): string {
	const prevMs = prev ? Date.parse(prev) : 0;
	const candidate = Math.max(Date.now(), prevMs + 1, lastUpdatedAtMs + 1);
	lastUpdatedAtMs = candidate;
	return new Date(candidate).toISOString();
}

/**
 * Reusable immutable-update for ANY `Versioned & Identifiable` entity.
 *
 * Returns a BRAND-NEW instance produced by `reconstruct`, carrying the same
 * `id` and a *strictly later* `updated_at`. The current entity is never
 * mutated; `id` and `updated_at` are always authoritative — any `id` or
 * `updated_at` present in `patch` is ignored in favour of the existing `id`
 * and a freshly generated timestamp.
 *
 * Wire it into a model with a one-line delegate, e.g.:
 * ```ts
 * update(patch: Partial<UserData>): User {
 *   return versionedUpdate(this, patch, User.from);
 * }
 * ```
 *
 * @typeParam D - the plain data shape (e.g. `UserData`), which must be
 *   `Identifiable & Versioned`.
 * @typeParam T - the reconstructed instance type (e.g. `User`).
 */
export function versionedUpdate<
	D extends Identifiable<string> & Versioned,
	T,
>(entity: D, patch: Partial<D>, reconstruct: (data: D) => T): T {
	return reconstruct({
		...entity,
		...patch,
		id: entity.id,
		updated_at: nextUpdatedAt(entity.updated_at),
	});
}

/**
 * Build a reusable, model-bound update function — the functional analogue of
 * `typia.createAssert`, but for immutable versioned updates.
 *
 * Pass the model CLASS (not merely a type argument) so the factory can capture
 * its static `from` at runtime AND infer both the plain data shape `D` and the
 * instance type `T` from `from`'s signature. A type-only `createUpdate<User>()`
 * would have no runtime handle on `User.from` and therefore could not
 * reconstruct a new instance — which is why the class is required.
 *
 * @example
 * const updateUser = createUpdate(User);
 * const next = updateUser(existingUser, { name: "Alicia" });
 * // `next` is a brand-new User, same id, strictly-later updated_at.
 */
export function createUpdate<
	D extends Identifiable<string> & Versioned,
	T,
>(ctor: { from(data: D): T }): (entity: D, patch: Partial<D>) => T {
	return (entity, patch) => versionedUpdate(entity, patch, ctor.from);
}

export { type Versioned };
