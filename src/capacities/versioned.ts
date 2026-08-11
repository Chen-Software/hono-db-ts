import type { tags } from "typia";
import type { CapacityConstructor } from "./capable";
import type { Identifiable } from "./identifiable";
import type { ImmutableSchema } from "./immutable";

/**
 * Versioned — the CAPACITY for entities whose history is a sequence of
 * immutable versions, each identified by a strictly-increasing `updated_at`.
 *
 * The capacity is deliberately STATELESS: it owns the *rules* of versioning
 * (monotonic timestamps, immutability, "id never changes, only the version
 * rotates"), never the *store*. The append-only history lives in
 * infrastructure (see `src/services/version-history-store.ts`); the model only
 * carries its current version plus the helpers to reason about versions.
 *
 * As a `CapacityConstructor` it ALSO gives the MODEL the version helpers
 * directly — `Post.latestOf(history)`, `post.isNewerThan(other)`,
 * `Post.nextUpdatedAt(...)`, `Post.versionedUpdate(...)`, etc. — so the
 * versioning logic is available in exactly one place and usable ergonomically,
 * with zero per-model boilerplate.
 */
export interface VersionedSchema extends ImmutableSchema {
	/** Version timestamp — strictly increases on every update; equals `created_at` on the first version. This field IS the version. */
	readonly updated_at: string & tags.Format<"date-time">;
}
export type Versioned = VersionedSchema;

// ---------------------------------------------------------------------------
// Pure helpers (no state) — safe to call directly, and attached to the model
// by the capacity mixin below.
// ---------------------------------------------------------------------------
const __nowMs = () => Date.now();

/**
 * Compute the next version timestamp for `data`, as epoch-ms.
 * Strictly greater than the existing `updated_at` (or `created_at` when the
 * entity has no version yet), and never in the past — this guards against
 * clock skew and against equal-ms collisions across isolated runtimes.
 */
export function nextUpdatedAt<T extends Identifiable<string> & Versioned>(
	data: T,
): number {
	const d = data as T & { created_at?: string };
	const base = data.updated_at
		? Date.parse(data.updated_at)
		: d.created_at
			? Date.parse(d.created_at)
			: __nowMs();
	const nowMs = __nowMs();
	return base >= nowMs ? base + 1 : nowMs;
}

/**
 * Wrap an *immutable* updater so the resulting instance gets a strictly-later
 * `updated_at`. The wrapped updater must return a brand-new instance (it must
 * not mutate `entity`); `withVersionBump` then stamps the version. This is how
 * `ContentAddressable.updateHash` (Post.update) gets its version bump for free.
 */
export function withVersionBump<T extends Identifiable<string> & Versioned>(
	updater: (entity: T, patch: Partial<T>) => T,
): (entity: T, patch: Partial<T>) => T {
	return (entity, patch) => {
		const next = updater(entity, patch);
		next.updated_at = new Date(nextUpdatedAt(entity)).toISOString();
		return next;
	};
}

/**
 * Immutable versioned update. Applies `patch` over everything EXCEPT the
 * authoritative `id`/`updated_at` (their patch values are ignored), then
 * delegates to `reconstruct` to mint the new instance. The caller wires
 * `reconstruct` to stamp content-address hashes, freeze, classify, etc.
 */
export function versionedUpdate<T extends Identifiable<string> & Versioned>(
	reconstruct: (data: T) => T,
	idAccessor: (entity: T) => string,
): (entity: T, patch: Partial<T>) => T {
	return (entity, patch) => {
		const { id, updated_at, ...rest } = entity as any;
		const merged = { ...rest, ...patch, id: idAccessor(entity) } as T;
		return reconstruct(merged);
	};
}

/** Convenience over `versionedUpdate` for entities whose id is `.id`. */
export function createVersionedUpdate<T extends Identifiable<string> & Versioned>(
	reconstructor: (data: T) => T,
) {
	return withVersionBump(versionedUpdate(reconstructor, (e) => e.id));
}

/**
 * Pick the newest version from a history array. Order is irrelevant — selection
 * is by max `updated_at`. Pure: no state, throws on empty input.
 */
export function latestOf<T extends Identifiable<string> & Versioned>(
	history: T[],
): T {
	if (history.length === 0) {
		throw new Error("latestOf: empty history");
	}
	return history.reduce((a, b) => (b.updated_at > a.updated_at ? b : a));
}

/** True when `a` is strictly newer than `b`. Pure. */
export function isNewerThan<T extends Identifiable<string> & Versioned>(
	a: T,
	b: T,
): boolean {
	return a.updated_at > b.updated_at;
}

/** Total order over versions by `updated_at`: `-1` / `0` / `+1`. Pure. */
export function compareVersions<T extends Identifiable<string> & Versioned>(
	a: T,
	b: T,
): number {
	return a.updated_at < b.updated_at ? -1 : a.updated_at > b.updated_at ? 1 : 0;
}

// ---------------------------------------------------------------------------
// CapacityConstructor mixin — gives the MODEL every version helper + owns the
// construction-time `updated_at` default. State (the history) still lives in
// infrastructure; the model only ever holds its current version.
// ---------------------------------------------------------------------------
export function Versioned<TBase extends CapacityConstructor>(
	Base: TBase,
): TBase {
	// Register into the capacity set paved by `Capable` (always applied first).
	Base.prototype.capacities && Base.prototype.addCapacity("Versioned");

	const MixedClass = class extends (Base as any) {
		constructor(...args: any[]) {
			const raw = args[0];
			if (raw && typeof raw === "object" && raw.updated_at == null) {
				// First version: the version timestamp equals `created_at` (or now
				// when the model carries no `created_at`). The version field is
				// thus always populated the moment an instance exists.
				raw.updated_at = (raw.created_at as string) ?? new Date().toISOString();
			}
			super(...args);
		}
	} as any;

	// --- static helpers: the whole version toolkit, one import away ---
	MixedClass.latestOf = latestOf;
	MixedClass.isNewerThan = isNewerThan;
	MixedClass.compareVersions = compareVersions;
	MixedClass.nextUpdatedAt = nextUpdatedAt;
	MixedClass.withVersionBump = withVersionBump;
	MixedClass.versionedUpdate = versionedUpdate;
	MixedClass.createVersionedUpdate = createVersionedUpdate;

	// --- instance helpers: compare THIS version against another ---
	MixedClass.prototype.isNewerThan = function (this: any, other: any): boolean {
		return this.updated_at > other.updated_at;
	};
	MixedClass.prototype.compareVersions = function (
		this: any,
		other: any,
	): number {
		const a = this.updated_at;
		const b = other.updated_at;
		return a < b ? -1 : a > b ? 1 : 0;
	};

	return MixedClass as unknown as TBase;
}
