import typia from "typia";
import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { type Blake3 } from "../tags/format-string-blake3";
import { type Identifiable } from "./identifiable";
import { type Versioned, versionedUpdate } from "./versioned";
import { type Immutable, createUpdate } from "./immutable";

/**
 * ContentField maps the (model-specific) content key to a single `string`
 * field. By making the key a type parameter we let each model name its payload
 * field whatever it likes — `content` by default, or `body`, `text`, ...
 *
 * The field is `readonly`: a content-addressed entity's payload is immutable —
 * you never mutate it in place, you reconstruct. That is exactly why
 * `ContentAddressable` extends the `Immutable` capacity.
 */
type ContentField<K extends string> = { readonly [P in K]: string };

/**
 * ContentAddressable is the capacity for CONTENT-ADDRESSED entities.
 *
 * The entity carries a content payload (named by `K`, default `"content"`)
 * together with the BLAKE3 hash of that payload. The hash *is* the address:
 * identical content yields an identical hash, and (collision-resistantly) the
 * hash uniquely identifies the content. This is the foundation for dedup,
 * tamper-proofing, and immutable content stores (Git blobs, IPFS-style
 * addressing, content-addressed storage).
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
 * merely validated once. That job belongs to the runtime helpers below:
 * `createAssertHash` (construction) and `updateHash` (update).
 *
 * @typeParam K - the name of the content field. Defaults to `"content"`.
 */
export type ContentAddressable<K extends string = "content"> = Immutable &
	ContentField<K> & {
		/** BLAKE3 hash (lowercase 64-hex) of the content field — the address. */
		readonly hash: string & Blake3;
	};

// ---------------------------------------------------------------------------
// Hashing helpers (the runtime counterpart to the type-level capacity)
// ---------------------------------------------------------------------------

/**
 * Compute the canonical 32-byte BLAKE3 digest of `content`, hex-encoded as a
 * lowercase 64-character string — exactly the form accepted by `Blake3`.
 *
 * This is the *address* of the content: equal content → equal hash. Store its
 * result in the entity's `hash` field (typically via `withContentHash`).
 */
export function hashContent(content: string): string {
	return bytesToHex(blake3(utf8ToBytes(content)));
}

/**
 * Verify that `entity.hash` is the correct BLAKE3 digest of the content stored
 * under `contentKey`. Returns `false` if the content was tampered with, the
 * hash is stale, or the content field is missing — the core integrity
 * guarantee of content-addressing.
 *
 * @param entity - a ContentAddressable instance or plain data object.
 * @param contentKey - the content field name ("content" by default; "body" for
 *   a Post). MUST be passed explicitly for non-default keys, because the key
 *   name is erased at runtime and the function needs to know which field to hash.
 */
export function verifyContentAddress<K extends string>(
	entity: ContentAddressable<K>,
	contentKey: K,
): boolean {
	const content = (entity as Record<string, unknown>)[contentKey];
	if (typeof content !== "string") return false;
	return entity.hash === hashContent(content);
}

/**
 * Attach the correct BLAKE3 hash to a content payload, recomputing it from
 * `contentKey` and OVERWRITING any incoming `hash`. Returns the fully-addressed
 * object. This is the primitive behind `createAssertHash` (construction) and
 * `updateHash` (update).
 *
 * Generic over `D` (the full entity data shape) so the result still carries
 * every other field — it is assignable back to `D` (e.g. `PostData`), which is
 * what lets the caller feed it straight into a model's `from`.
 *
 * @example
 * const post = Post.from(withContentHash({ ...data, body }, "body"));
 */
export function withContentHash<
	K extends string,
	D extends Record<K, string>,
>(payload: D & { hash?: string }, contentKey: K): D & { hash: string } {
	const content = payload[contentKey];
	return { ...payload, hash: hashContent(content) };
}

// ---------------------------------------------------------------------------
// Construction-time: stamp the hash (the "assert" half)
// ---------------------------------------------------------------------------

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
		payload: D & { hash?: string },
	): D & { hash: string } => withContentHash(payload, key);
}

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
	return (entity: D, patch: Partial<D>): T =>
		versionedUpdate(entity, patch, (d) => ctor.from(withContentHash(d, key)));
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
 *                         version bump. Requires only `Identifiable & Immutable`,
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
			D extends Identifiable<string> & Immutable & Record<K, string>,
			T,
		>(
			ctor: { from(data: D): T },
		) => createUpdate<D, T>((d) => ctor.from(withContentHash(d, key))),

		/**
		 * Bind a model class; returns an update fn that bumps the version AND
		 * re-derives the hash — for entities wearing BOTH `Versioned` and
		 * `ContentAddressable`. Delegates to `updateHash`, which composes the
		 * `Versioned` capacity's version step with the hash re-derivation.
		 */
		updateForVersioned: <
			D extends Identifiable<string> & Versioned & Record<K, string>,
			T,
		>(
			ctor: { from(data: D): T },
		) => updateHash(key, ctor),
	};
}

// ---------------------------------------------------------------------------
// Concrete validators for the default "content" key (mirrors identifiable.ts)
// ---------------------------------------------------------------------------
export const isContentAddressable = typia.createIs<ContentAddressable>();
export const validateContentAddressable = typia.createValidate<ContentAddressable>();
