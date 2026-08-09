import type { UUID } from "crypto";
import typia, { type tags, type Classifiable } from "typia";
import type { Identifiable } from "../capacities/identifiable";
import type { Timestamped } from "../capacities/timestamped";
import { type Versioned } from "../capacities/versioned";
import {
	type ContentAddressable,
	createContentAddressing,
} from "../capacities/content-addressable";
import type { User } from "./user";
import { type Blake3 } from "../tags/format-string-blake3";
import { isProd } from "@/macros";

/**
 * Post data model.
 *
 * Composes the SAME capacity set as `User` — `Identifiable` (uuid `id`),
 * `Timestamped` (`created_at`), and `Versioned` (`updated_at` doubles as the
 * version timestamp). The only model-specific addition is `author: User`, a
 * nested `User` reference. This is the proof that the capacities are reusable:
 * `Post` gets the identical versioning behaviour (immutable `update` + the
 * `createUpdate` factory) by wiring in the shared `versionedUpdate` helper,
 * with zero capacity changes.
 */
interface PostData extends
	Identifiable<UUID>,
	Timestamped,
	Versioned,
	ContentAddressable<"body"> {
	/** Post title. */
	title: string & tags.MinLength<1> & tags.MaxLength<200>;

	/** Post body / content. (The `body` field + `hash` come from the
	 *  `ContentAddressable<"body">` capacity; the length constraints are added
	 *  here — the intersection accumulates the tags.) */
	body: string & tags.MinLength<1> & tags.MaxLength<10000>;

	/** Author of the post — a nested `User` (instance or plain data). */
	author: User;

	/** Whether the post is published. */
	published: boolean;
}

// static reusable functions
const cloneFn = typia.plain.createAssertClone<PostData>();
const pruneFn = typia.plain.createAssertPrune<PostData>();

/**
 * Post class — same shape contract as `User`:
 * - static members mirror the typia model API (`Post.is`, `Post.validate`,
 *   `Post.from`, `Post.clone`, `Post.toJSON`, `Post.encode`, ...);
 * - `Post.from` returns a `Post` *instance* with bound methods;
 * - `author` is carried through untouched, so a `User` instance passed in
 *   keeps its own methods (e.g. `post.author.update(...)`).
 */
class Post implements PostData {
	id!: UUID;
	title!: string;
	/** Content field — `readonly` because content addressing requires the
	 *  payload to be immutable (you reconstruct, never mutate). Supplied by the
	 *  `ContentAddressable<"body">` capacity. */
	readonly body!: string;
	author!: User;
	published!: boolean;
	created_at!: string;

	/** Version timestamp — strictly increases on every update; equals `created_at` on the first version. This field IS the version. */
	updated_at!: string & tags.Format<"date-time">;

	/** BLAKE3 content address of `body` — `readonly`; always derived from
	 *  `body` by `createAssertHash` (construction) or `updateHash` (update).
	 *  Supplied by the `ContentAddressable<"body">` capacity. */
	readonly hash!: string & Blake3;

	private constructor(data: Classifiable<PostData>) {
		return Object.assign(this, typia.plain.assertClassify<PostData>(data));
	}

	// ---- static factory / creators ------------------------------------------
	static from(data: PostData): Post {
		// The constructor is the single place that STAMPS the content address,
		// because objects are immutable. `assertBodyHash` recomputes `hash`
		// from `body`, overwriting any caller-supplied value.
		return new Post(assertBodyHash(data));
	}

	// ---- instance methods (prototype) ---------------------------------------
	/** Structural equality against another post or post instance. */
	equals(other: PostData | Post): boolean {
		return Post.equals(this, other);
	}

	/** Assert this instance is a valid post (throws otherwise). */
	assert(): PostData {
		return Post.assert(this);
	}

	/** Validate this instance, returning structured errors if any. */
	validate() {
		return Post.validate(this);
	}

	/** Clone this instance (deep copy, strips extras). */
	clone(): Post {
		return Post.from(cloneFn(this));
	}

	/** Prune this instance to the validated schema. */
	prune(): Post {
		return Post.from(pruneFn(this));
	}

	/**
	 * Immutable update. Returns a BRAND-NEW `Post` carrying the same `id` and a
	 * *strictly later* `updated_at`; the current instance is never mutated.
	 * `id` and `updated_at` are authoritative — any `id`/`updated_at` in the
	 * patch is ignored. Delegates to the shared `versionedUpdate` helper so the
	 * versioning logic lives in exactly one place.
	 */
	update(patch: Partial<PostData>): Post {
		// `updatePost` bumps the version (Versioned) AND recomputes the content
		// address from `body` — the hash can never drift from the content.
		return updatePost(this, patch);
	}

	/** JSON string representation. */
	stringify(): string {
		return Post.toJSON(this);
	}

	/** Raw data, so `JSON.stringify(p)` yields the post object. */
	toJSON(): PostData {
		return this;
	}

	/** Protobuf-encode this instance. */
	encode(): Uint8Array {
		return Post.encode(this);
	}

	/** Protobuf-decode a fresh instance from this instance's encoding. */
	decode(): PostData {
		return Post.decode(Post.encode(this));
	}

	// ---- static functions ---------------------------------------------------
	static random = typia.createRandom<PostData>();
	static is = typia.createIs<PostData>();
	static equals = typia.compare.createEquals<PostData>();
	static assert = typia.createAssert<PostData>();
	static validate = typia.createValidate<PostData>();
	static validatePartial = typia.createValidate<Partial<PostData>>();
	static clone = typia.plain.createAssertClone<PostData>();
	static prune = typia.plain.createAssertPrune<PostData>();
	static toJSON = typia.json.createAssertStringify<PostData>();
	static fromJSON = typia.json.createAssertParse<PostData>();
	static encode = typia.protobuf.createAssertEncode<PostData>();
	static decode = typia.protobuf.createAssertDecode<PostData>();
	static message = typia.protobuf.message<PostData>();
	static schema = typia.json.schema<[PostData]>();
	static metaSchema = !isProd ? typia.reflect.schema<PostData>() : undefined;
}

// ---------------------------------------------------------------------------
// Content-addressing wiring (Immutable + ContentAddressable capacities)
// ---------------------------------------------------------------------------
// Name the content key ONCE via `createContentAddressing`. Everything else —
// stamping the hash at construction and re-deriving it (plus bumping the
// version, since Post is also `Versioned`) on update — is bound from that
// single key. `updateForVersioned` composes both capacities.
const CA = createContentAddressing("body");
const assertBodyHash = CA.assertHash; // stamp hash from `body` (→ createAssertHash)
const updatePost = CA.updateForVersioned(Post); // version bump + re-hash (→ updateHash)

export { type PostData, Post };
export { Post as PostModel };
