import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import typia from "typia";
import type { CapacityComposer } from "./compose";
import type { Blake3 } from "../tags/format-string-blake3";
import type { ImmutableSchema } from "./immutable";
import { createUpdate } from "./immutable";
import type { Identifiable } from "./identifiable";
import type { Versionable } from "./versionable";
import { versionableUpdate, withVersionBump } from "./versionable";

/**
 * ContentField maps the (model-specific) content key to a single `string`
 * field. By making the key a type parameter we let each model name its payload
 * field whatever it likes — `content` by default, or `body`, `text`, ...
 *
 * The field is `readonly`: a content-hashable entity's payload is immutable —
 * you never mutate it in place, you reconstruct. That is exactly why `Hashable`
 * extends the `ImmutableSchema` capacity.
 */
type ContentField<K extends string> = { readonly [P in K]: string };

/**
 * Hashable — the CAPACITY for entities that carry a content-derived BLAKE3
 * digest (the `contentHash` field) alongside a named content payload.
 *
 * This capacity owns the *hash* concern: the type of the `contentHash` field
 * (`string & Blake3`), the hashing primitives (`hashContent`,
 * `verifyContentAddress`, `withContentHash`, `createAssertHash`), and the
 * format-level validators. It does NOT know about versioning or where the
 * content lives semantically — that is layered on by model wiring (the
 * `createContentAddressing` enabler adds the content-keyed addressing rules
 * and, for versionable entities, composes with the `Versionable` capacity).
 *
 * Splitting the hash concern out means any entity (versioned or not) can be
 * `Hashable` without pulling in content-addressing semantics, and the hashing
 * helpers live in exactly one place.
 *
 * As a `CapacityComposer` (`function Hashable(Base, mod, options)`) it ALSO
 * gives the MODEL the hash instance API directly — `post.hash()`,
 * `post.verify()`, `post.address()` — and registers the capacity, so the
 * hashing behaviour is available ergonomically with zero per-model boilerplate.
 * Crucially, the mixin is SELF-SUFFICIENT for construction: its constructor
 * STAMPS `contentHash` from the content field (named by `key`) on every
 * instance, just as `Versionable` owns `updated_at`. Update-time re-hashing
 * (which must also bump the version for versioned entities) is composed by the
 * model via the `createContentAddressing` enabler — `updateForVersionable` —
 * mirroring how `Versionable` keeps `versionableUpdate` separate from its mixin.
 *
 * @typeParam K - the name of the content field. Defaults to `"content"`.
 */
export type Hashable<K extends string = "content"> = ImmutableSchema &
	ContentField<K> & {
		/** BLAKE3 content hash (lowercase 64-hex) of the content field. */
		readonly contentHash: string & Blake3;
	};

/**
 * Instance API the {@link Hashable} mixin surfaces on every adorned model:
 * `hash()` (recompute the BLAKE3 digest), `verify()` (integrity check) and
 * `address()` (the stored content hash). Declared as a standalone interface so
 * the capacity's *return type* can carry it — which means a model that lists
 * `Hashable` inherits `hash`/`verify`/`address` automatically and does NOT have
 * to re-declare them with `declare`. (See `compose.ts`' `CapacityInstance`,
 * which folds this into the composed model type.)
 */
export interface HashableInstance {
	/** Recompute + return the BLAKE3 content digest from the content field. */
	hash(): string;
	/** Integrity check: does `contentHash` equal blake3(content)? */
	verify(): boolean;
	/** The content address — the stored `contentHash` field. */
	address(): string;
}

/** Static content-addressing API a `Hashable` model exposes. The mixin hangs
 *  `hashContent` / `verifyContentAddress` onto the adorned class, and the
 *  capacity's return type carries them — so a model that lists `Hashable`
 *  inherits them automatically and does NOT have to re-declare them. */
export interface HashableStatic {
	/** BLAKE3 content hash (lowercase 64-hex) of a content record. */
	hashContent(data: string): string;
	/** Verify a record's `contentHash` matches its content. */
	verifyContentAddress(data: Record<string, unknown>, key?: string): boolean;
}

// ---------------------------------------------------------------------------
// Hashing helpers (the runtime counterpart to the type-level capacity)
// ---------------------------------------------------------------------------

/**
 * Compute the canonical 32-byte BLAKE3 digest of `content`, hex-encoded as a
 * lowercase 64-character string — exactly the form accepted by `Blake3`.
 *
 * This is the *address* of the content: equal content → equal hash.
 */
export function hashContent(content: string): string {
	return bytesToHex(blake3(utf8ToBytes(content)));
}

/**
 * Verify that `entity.contentHash` is the correct BLAKE3 digest of the content
 * stored under `contentKey`. Returns `false` if the content was tampered with,
 * the hash is stale, or the content field is missing — the core integrity
 * guarantee of content-hashing.
 *
 * @param entity - a Hashable instance or plain data object.
 * @param contentKey - the content field name ("content" by default; "body" for
 *   a Post). MUST be passed explicitly for non-default keys, because the key
 *   name is erased at runtime and the function needs to know which field to hash.
 */
export function verifyContentAddress<K extends string>(
	entity: Hashable<K>,
	contentKey: K,
): boolean {
	const content = (entity as Record<string, unknown>)[contentKey];
	if (typeof content !== "string") return false;
	return entity.contentHash === hashContent(content);
}

/**
 * Attach the correct BLAKE3 hash to a content payload, recomputing it from
 * `contentKey` and OVERWRITING any incoming `contentHash`. Returns the
 * fully-addressed object. This is the primitive behind `createAssertHash`
 * (construction) and `updateHash` (update).
 *
 * Generic over `D` (the full entity data shape) so the result still carries
 * every other field — it is assignable back to `D` (e.g. `PostData`), which is
 * what lets the caller feed it straight into a model's `from`.
 *
 * @example
 * const post = Post.from(withContentHash({ ...data, body }, "body"));
 */
export function withContentHash<K extends string, D extends Record<K, string>>(
	payload: D & { contentHash?: string },
	contentKey: K,
): D & { contentHash: string } {
	const content = payload[contentKey];
	return { ...payload, contentHash: hashContent(content) };
}

/**
 * createAssertHash — bind a content field name and return a function that STAMPS
 * the correct BLAKE3 hash onto a payload, recomputing it from `key` and ignoring
 * any caller-supplied hash. This is the construction-time counterpart to
 * `updateHash`: wire it into a model's `from`/`constructor` so every new
 * instance is correctly addressed without callers having to compute the hash.
 *
 * Because objects are immutable, the constructor is the ONLY place that needs to
 * set the hash up — once stamped, it can never drift.
 *
 * @example
 * const assertBodyHash = createAssertHash("body");
 * // inside Post.from:
 * return new Post(assertBodyHash(data));
 */
export function createAssertHash<K extends string>(key: K) {
	return <D extends Record<K, string>>(
		payload: D & { contentHash?: string },
	): D & { contentHash: string } => withContentHash(payload, key);
}

// ---------------------------------------------------------------------------
// Concrete validators for the default "content" key (mirrors identifiable.ts)
// ---------------------------------------------------------------------------
export const isHashable = typia.createIs<Hashable>();
export const validateHashable = typia.createValidate<Hashable>();

// ---------------------------------------------------------------------------
// Update-time: recompute the hash on every content set (the "mutation" half)
// ---------------------------------------------------------------------------

/**
 * updateHash — bind a content field + a model constructor and return an
 * IMMUTABLE update function that, on EVERY call:
 *   1. applies `patch` and bumps the version via the shared `Versionable`
 *      capacity (same `id`, strictly-later `updated_at`), then
 *   2. recomputes the BLAKE3 hash from `key` (idempotent when the content is
 *      unchanged) so the address can never drift from the content.
 *
 * The hash is recomputed HERE (not merely delegated to `from`) so the result is
 * content-addressed even if the model's `from` were naive. Wire it into a
 * model's `update` method:
 *
 * @example
 * const updatePost = updateHash("body", Post);
 * // inside Post.update:  return updatePost(this, patch);
 */
export function updateHash<
	K extends string,
	D extends Identifiable<string> & Versionable & Record<K, string>,
	T,
>(key: K, ctor: { from(data: D): T }) {
	return withVersionBump(
		(entity: D, patch: Partial<D>): T =>
			versionableUpdate(
				(d) => ctor.from(withContentHash(d, key)),
				(e) => e.id,
			)(entity, patch),
	);
}

// ---------------------------------------------------------------------------
// One-mention enabler: name your content key ONCE, get both wiring hooks
// ---------------------------------------------------------------------------

/**
 * createContentAddressing — the MINIMAL boilerplate enabler for the capacity.
 *
 * A model only has to name its content key a single time; this returns the
 * hooks it needs to wire the capacity into its `from` (construction) and
 * `update` (mutation) methods:
 *
 * - `assertHash`        — stamp the correct hash at construction (`createAssertHash`)
 * - `updateFor`         — RE-DERIVE the hash on every content set, with NO
 *                         version bump. Requires only `Identifiable & ImmutableSchema`,
 *                         so a content-addressable entity does NOT have to be
 *                         versioned (the two capacities are independent).
 * - `updateForVersionable`— RE-DERIVE the hash AND bump the version, for entities
 *                         that wear BOTH `Hashable` and `Versionable`
 *                         (e.g. `Post`). Delegates to `updateHash`.
 *
 * @example (content-addressable but NOT versioned)
 * const CA = createContentAddressing("content");
 * static from(d) { return new Blob(CA.assertHash(d)); }
 * update(p) { return blobUpdate(this, p); }
 * const blobUpdate = CA.updateFor(Blob);
 *
 * @example (both — e.g. Post)
 * const CA = createContentAddressing("body");
 * const assertBodyHash = CA.assertHash;
 * const updatePost = CA.updateForVersionable(Post);
 */
export function createContentAddressing<K extends string>(key: K) {
	return {
		/** Stamp the correct BLAKE3 hash from `key` — use inside `from`. */
		assertHash: createAssertHash(key),

		/**
		 * Bind a model class; returns an update fn that RE-DERIVES the hash from
		 * `key` on every content set. Requires NO `Versionable` — this is the path
		 * for entities that are content-addressable but NOT versioned. Built on
		 * the `Immutable` capacity's base `createUpdate`.
		 */
		updateFor: <
			D extends Identifiable<string> & ImmutableSchema & Record<K, string>,
			T,
		>(ctor: {
			from(data: D): T;
		}) => createUpdate<D, T>((d) => ctor.from(withContentHash(d, key))),

		/**
		 * Bind a model class; returns an update fn that bumps the version AND
		 * re-derives the hash — for entities wearing BOTH `Versionable` and
		 * `Hashable`. Delegates to `updateHash`, which composes the `Versionable`
		 * capacity's version step with the hash re-derivation.
		 */
		updateForVersionable: <
			D extends Identifiable<string> & Versionable & Record<K, string>,
			T,
		>(ctor: {
			from(data: D): T;
		}) => updateHash(key, ctor),
	};
}

// ---------------------------------------------------------------------------
// CapacityComposer mixin — gives the MODEL the hash instance API
// (`hash`/`verify`/`address`), registers the capacity, AND owns construction-
// time `contentHash` stamping (like `Versionable` owns `updated_at`). Update-time
// re-hashing is composed by the model via `createContentAddressing` (the
// `updateFor` / `updateForVersionable` hooks), mirroring how `Versionable` keeps
// `versionableUpdate` separate from its own mixin.
// ---------------------------------------------------------------------------

/**
 * Options for the {@link Hashable} mixin — the content field name.
 * Pass `"body"` for `Post`.
 */
export interface HashableOptions<K extends string = "content"> {
	/** content field name; defaults to `"content"`. For `Post`, pass `"body"`. */
	key?: K;
}

export function Hashable<
	TBase extends CapacityComposer,
	K extends string = "content",
>(
	Base: TBase,
	_mod?: unknown,
	options: HashableOptions<K> = {},
): TBase & HashableStatic & HashableInstance {
	const key = (options.key ?? "content") as string;
	Base.prototype.capacities && Base.prototype.addCapacity("Hashable");

	const MixedClass = class extends (Base as any) {
		constructor(...args: any[]) {
			super(...args);
			// Construction-time stamping: a content-hashable entity is immutable,
			// so the constructor is the ONLY place the hash needs to be set. We
			// recompute it from the content field (named by `key`), overwriting
			// any caller-supplied value, so every instance is correctly addressed
			// no matter how it was constructed (`from`, `fromJSON`, a factory…).
			const content = (this as Record<string, unknown>)[key];
			if (typeof content === "string") {
				(this as Record<string, unknown>).contentHash = hashContent(content);
			}
		}

		/**
		 * Return the content-derived BLAKE3 digest — recomputed from the content
		 * field named by `key` (defaults to `"content"`). Recomputing (rather
		 * than reading the stored `contentHash`) means this can NEVER return a
		 * stale value even if the entity were somehow mutated.
		 */
		hash(): string {
			const content = (this as Record<string, unknown>)[key];
			return typeof content === "string"
				? hashContent(content)
				: ((this as Record<string, unknown>).contentHash as string);
		}

		/** Integrity check: does `contentHash` equal blake3(content)? */
		verify(): boolean {
			return verifyContentAddress(this, key);
		}

		/** The content address — alias for the stored `contentHash` field. */
		address(): string {
			return (this as Record<string, unknown>).contentHash as string;
		}
	} as any;

	// Expose the hashing primitives on the class for convenience.
	MixedClass.hashContent = hashContent;
	MixedClass.verifyContentAddress = verifyContentAddress;
	MixedClass.withContentHash = withContentHash;
	MixedClass.createAssertHash = createAssertHash;
	MixedClass.updateHash = updateHash;
	MixedClass.createContentAddressing = createContentAddressing;

	return MixedClass as unknown as TBase & HashableStatic & HashableInstance;
}
