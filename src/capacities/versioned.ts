import { type tags } from "typia";
import type { Identifiable } from "./identifiable";
import type { ImmutableSchema } from "./immutable";

/**
 * Versioned marks an entity as an immutable, append-only instance of a logical
 * object identified by its `id`.
 *
 * It EXTENDS the `Immutable` capacity — every versioned entity is, by
 * definition, immutable (a modification yields a NEW instance, never an
 * in-place mutation). Inheriting the marker is what lets a `Versioned` entity
 * reuse the `Immutable` update vocabulary (`createUpdate`, `createAssertUpdate`,
 * `createValidateUpdate`, …).
 *
 * The version discriminator is the `updated_at` timestamp: every modification
 * produces a NEW object with the same `id` and a *strictly later* `updated_at`.
 * Prior instances are never mutated, which keeps the entity event-sourced and
 * safe for audit / time-travel. `updated_at` therefore doubles as the version
 * identifier — lexicographic comparison of the ISO strings orders versions
 * chronologically, and equals `created_at` on the very first version.
 */
interface Versioned extends ImmutableSchema {
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
export function versionedUpdate<D extends Identifiable<string> & Versioned, T>(
	entity: D,
	patch: Partial<D>,
	reconstruct: (data: D) => T,
): T {
	// Merge, then make `id` and `updated_at` authoritative: any `id`/`updated_at`
	// in the patch is ignored in favour of the existing id and a freshly
	// bumped version. `withVersionBump` supplies the strictly-later `updated_at`.
	const merged = { ...entity, ...patch };
	return reconstruct({ ...withVersionBump(merged), id: entity.id });
}

/**
 * Bump the version of a plain data object WITHOUT reconstructing — the pure
 * "version step" other update helpers compose. Returns a shallow clone with a
 * strictly-later `updated_at`. `id` is left untouched (callers are
 * responsible for preserving identity; `versionedUpdate` does that for you).
 */
export function withVersionBump<D extends Identifiable<string> & Versioned>(
	data: D,
): D {
	return { ...data, updated_at: nextUpdatedAt(data.updated_at) };
}

/**
 * Model-bound, VERSION-BUMPING immutable update — the functional analogue of
 * `typia.createAssert`, but for versioned models.
 *
 * It delegates to the shared {@link versionedUpdate}, so every call returns a
 * brand-new instance carrying the same `id` and a *strictly later* `updated_at`
 * (the `Versioned` contract) — and `id`/`updated_at` in a patch are ignored.
 *
 * Pass the model CLASS (not merely a type argument) so the factory can capture
 * its static `from` at runtime AND infer both the plain data shape `D` and the
 * instance type `T` from `from`'s signature. A type-only `createVersionedUpdate<User>()`
 * would have no runtime handle on `User.from` and therefore could not
 * reconstruct a new instance — which is why the class is required.
 *
 * @example
 * const updateUser = createVersionedUpdate(User);
 * const next = updateUser(existingUser, { name: "Alicia" });
 * // `next` is a brand-new User, same id, strictly-later updated_at.
 */
export function createVersionedUpdate<
	D extends Identifiable<string> & Versioned,
	T,
>(ctor: { from(data: D): T }): (entity: D, patch: Partial<D>) => T {
	return (entity, patch) => versionedUpdate(entity, patch, ctor.from);
}

export { type Versioned };
