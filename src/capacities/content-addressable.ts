import typia from "typia";
import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { type Blake3 } from "../tags/format-string-blake3";
import { type Identifiable } from "./identifiable";
import { type Versioned, versionedUpdate } from "./versioned";

/**
 * ContentField maps the (model-specific) content key to a single `string`
 * field. By making the key a type parameter we let each model name its payload
 * field whatever it likes — `content` by default, or `body`, `text`, ...
 */
type ContentField<K extends string> = { [P in K]: string };

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
 * interface PostData extends ContentAddressable<"body"> { body: string; ... }
 * ```
 * `ContentField<"body">` resolves to exactly `{ body: string }`, so the model
 * simply has a `body: string` field plus the shared `hash` field.
 *
 * @typeParam K - the name of the content field. Defaults to `"content"`.
 */
export type ContentAddressable<K extends string = "content"> = ContentField<K> & {
	/** BLAKE3 hash (lowercase 64-hex) of the content field — the content's address. */
	hash: string & Blake3;
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
 * Attach the correct BLAKE3 hash to a content payload. Takes a payload object
 * that has the content field but not yet `hash`, computes the digest over
 * `contentKey`, and returns the fully-addressed object. Useful in services
 * right before persisting an entity.
 *
 * @example
 * const post = Post.from(withContentHash({ ...data, body }, "body"));
 */
export function withContentHash<K extends string>(
	payload: Omit<ContentAddressable<K>, "hash"> & Record<K, string>,
	contentKey: K,
): ContentAddressable<K> {
	const content = payload[contentKey];
	return { ...payload, hash: hashContent(content) };
}

// ---------------------------------------------------------------------------
// Composed update — the "automatic updateContentHash" mechanism
// ---------------------------------------------------------------------------

/**
 * contentAddressableUpdate — fuse the ContentAddressable + Versioned capacities
 * into ONE immutable update that ALSO keeps the content hash in sync with its
 * payload. On every call it:
 *
 *   1. applies `patch` to `entity`,
 *   2. recomputes `hash` from `contentKey` (so the address always matches the
 *      content — you never hand-write an `updateContentHash` call),
 *   3. delegates to `versionedUpdate`, so the result is a brand-new instance
 *      with the same `id` and a strictly-later `updated_at`.
 *
 * `contentKey` is a runtime parameter because the generic `K` is erased at
 * runtime. The hash is recomputed unconditionally (idempotent when the content
 * is unchanged), which guarantees the address can never drift from the content.
 *
 * @example
 * class Post {
 *   update(patch: Partial<PostData>): Post {
 *     return contentAddressableUpdate(this, patch, "body", Post.from);
 *   }
 * }
 */
export function contentAddressableUpdate<
	K extends string,
	D extends Identifiable<string> & Versioned & ContentAddressable<K>,
	T,
>(entity: D, patch: Partial<D>, contentKey: K, reconstruct: (data: D) => T): T {
	const merged = { ...entity, ...patch } as D;
	const addressed = withContentHash(merged, contentKey);
	return versionedUpdate(entity, addressed, reconstruct);
}

/**
 * Build a model-bound, content-addressing update function — the analogue of
 * `createUpdate` for entities that are BOTH `Versioned` AND `ContentAddressable`.
 * The returned function recomputes the content hash on every call, so callers
 * get automatic `updateContentHash` behaviour for free, with no scattered
 * hashing logic at the call sites.
 *
 * @example
 * const updatePost = createContentAddressableUpdate("body", Post);
 * // in Post.update:  return updatePost(this, patch);
 */
export function createContentAddressableUpdate<
	K extends string,
	D extends Identifiable<string> & Versioned & ContentAddressable<K>,
	T,
>(contentKey: K, ctor: { from(data: D): T }) {
	return (entity: D, patch: Partial<D>): T =>
		contentAddressableUpdate(entity, patch, contentKey, ctor.from);
}

// ---------------------------------------------------------------------------
// Concrete validators for the default "content" key (mirrors identifiable.ts)
// ---------------------------------------------------------------------------
const isContentAddressable = typia.createIs<ContentAddressable>();
const validateContentAddressable = typia.createValidate<ContentAddressable>();

export { isContentAddressable, validateContentAddressable };
