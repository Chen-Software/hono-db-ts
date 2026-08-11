import typia from "typia";
import type { Identifiable } from "./identifiable";
import { type ImmutableSchema, createUpdate } from "./immutable";
import type { Versioned } from "./versioned";
import {
	type Hashable,
	hashContent,
	verifyContentAddress,
	withContentHash,
	createAssertHash,
} from "./hashable";
import { versionedUpdate, withVersionBump } from "./versioned";

/**
 * Re-export the hash primitives from `hashable` so existing importers of
 * `content-addressable` keep working. The *hash* concern now lives in
 * `hashable.ts`; this module owns only the content-ADDRESSING concern
 * (the content-keyed relationship between a payload and its hash).
 */
export {
	type Hashable,
	hashContent,
	verifyContentAddress,
	withContentHash,
	createAssertHash,
};

/**
 * ContentAddressable is the capacity for CONTENT-ADDRESSED entities.
 *
 * It extends `Hashable` (carrying the `hash` field + hashing primitives) and
 * adds the *addressing* semantics: the entity's content payload (named by `K`,
 * default `"content"`) is immutably tied to its hash. Identical content yields
 * an identical hash, and (collision-resistantly) the hash uniquely identifies
 * the content. This is the foundation for dedup, tamper-proofing, and immutable
 * content stores (Git blobs, IPFS-style addressing, content-addressed storage).
 *
 * `K` defaults to `"content"`, so the common case needs no annotation:
 * ```ts
 * interface BlobData extends ContentAddressable { content: string; ... }
 * ```
 *
 * A model whose payload lives under `body` (e.g. `Post`) passes the key
 * positionally. TypeScript has no *named* type arguments, so we use a
 * positional generic with a default rather than the wished-for
 * `ContentAddressable<contentKey="body">`:
 * ```ts
 * interface PostData extends ContentAddressable<"body"> { ... }
 * ```
 * which resolves to `{ readonly body: string; readonly hash: string & Blake3 }`.
 *
 * SEMANTIC CORRECTNESS IS NOT A TAG. `Blake3` only checks the *format* of the
 * hash string. We deliberately do NOT use an object-scoped tag to assert
 * `hash === blake3(content)` — content is immutable, so the hash must be
 * RE-DERIVED every time content is set (at construction and on update), not
 * merely validated once. That job belongs to the runtime helpers in `hashable`
 * (`createAssertHash` at construction, `verifyContentAddress` as a check) and to
 * `updateHash` below (update-time re-hash).
 *
 * @typeParam K - the name of the content field. Defaults to `"content"`.
 */
export type ContentAddressable<K extends string = "content"> = Hashable<K>;

// ---------------------------------------------------------------------------
// Update-time: recompute the hash on every content set (the "mutation" half)
// ---------------------------------------------------------------------------

/**
 * updateHash — bind a content field + a model constructor and return an
 * IMMUTABLE update function that, on EVERY call:
 *   1. applies `patch` and bumps the version via the shared `Versioned`
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
	D extends Identifiable<string> & Versioned & Record<K, string>,
	T,
>(key: K, ctor: { from(data: D): T }) {
	return withVersionBump((entity: D, patch: Partial<D>): T =>
		versionedUpdate(
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
 * - `updateForVersioned`— RE-DERIVE the hash AND bump the version, for entities
 *                         that wear BOTH `ContentAddressable` and `Versioned`
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
 * const updatePost = CA.updateForVersioned(Post);
 */
export function createContentAddressing<K extends string>(key: K) {
	return {
		/** Stamp the correct BLAKE3 hash from `key` — use inside `from`. */
		assertHash: createAssertHash(key),

		/**
		 * Bind a model class; returns an update fn that RE-DERIVES the hash from
		 * `key` on every content set. Requires NO `Versioned` — this is the path
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
		 * re-derives the hash — for entities wearing BOTH `Versioned` and
		 * `ContentAddressable`. Delegates to `updateHash`, which composes the
		 * `Versioned` capacity's version step with the hash re-derivation.
		 */
		updateForVersioned: <
			D extends Identifiable<string> & Versioned & Record<K, string>,
			T,
		>(ctor: {
			from(data: D): T;
		}) => updateHash(key, ctor),
	};
}

// ---------------------------------------------------------------------------
// Concrete validators for the default "content" key (mirrors identifiable.ts)
// ---------------------------------------------------------------------------
export const isContentAddressable = typia.createIs<ContentAddressable>();
export const validateContentAddressable =
	typia.createValidate<ContentAddressable>();
