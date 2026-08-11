import typia from "typia";
import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import type { Blake3 } from "../tags/format-string-blake3";
import type { ImmutableSchema } from "./immutable";

/**
 * ContentField maps the (model-specific) content key to a single `string`
 * field. By making the key a type parameter we let each model name its payload
 * field whatever it likes — `content` by default, or `body`, `text`, ...
 *
 * The field is `readonly`: a content-hashable entity's payload is immutable —
 * you never mutate it in place, you reconstruct. That is exactly why
 * `Hashable` extends the `ImmutableSchema` capacity.
 */
type ContentField<K extends string> = { readonly [P in K]: string };

/**
 * Hashable — the CAPACITY for entities that carry a content-derived BLAKE3
 * digest (the `hash` field) alongside a named content payload.
 *
 * This capacity owns only the *hash* concern: the type of the `hash` field
 * (`string & Blake3`), the hashing primitives (`hashContent`,
 * `verifyContentAddress`, `withContentHash`, `createAssertHash`), and the
 * format-level validators. It does NOT know about versioning or where the
 * content lives semantically — that is layered on by `ContentAddressable`,
 * which extends `Hashable` and adds the content-keyed addressing rules.
 *
 * Splitting the hash concern out means any entity (versioned or not) can be
 * `Hashable` without pulling in content-addressing semantics, and the hashing
 * helpers live in exactly one place.
 *
 * @typeParam K - the name of the content field. Defaults to `"content"`.
 */
export type Hashable<K extends string = "content"> = ImmutableSchema &
	ContentField<K> & {
		/** BLAKE3 hash (lowercase 64-hex) of the content field. */
		readonly hash: string & Blake3;
	};

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
 * Verify that `entity.hash` is the correct BLAKE3 digest of the content stored
 * under `contentKey`. Returns `false` if the content was tampered with, the
 * hash is stale, or the content field is missing — the core integrity
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
export function withContentHash<K extends string, D extends Record<K, string>>(
	payload: D & { hash?: string },
	contentKey: K,
): D & { hash: string } {
	const content = payload[contentKey];
	return { ...payload, hash: hashContent(content) };
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
		payload: D & { hash?: string },
	): D & { hash: string } => withContentHash(payload, key);
}

// ---------------------------------------------------------------------------
// Concrete validators for the default "content" key (mirrors identifiable.ts)
// ---------------------------------------------------------------------------
export const isHashable = typia.createIs<Hashable>();
export const validateHashable = typia.createValidate<Hashable>();
