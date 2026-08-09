import type { UUID } from "crypto";
import typia, { type tags, type Classifiable } from "typia";
import type { Identifiable } from "../capacities/identifiable";
import type { Timestamped } from "../capacities/timestamped";
import { type Versioned, versionedUpdate } from "../capacities/versioned";
import type { User } from "./user";
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
interface PostData extends Identifiable<UUID>, Timestamped, Versioned {
	/** Post title. */
	title: string & tags.MinLength<1> & tags.MaxLength<200>;

	/** Post body / content. */
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
	body!: string;
	author!: User;
	published!: boolean;
	created_at!: string;

	/** Version timestamp — strictly increases on every update; equals `created_at` on the first version. This field IS the version. */
	updated_at!: string & tags.Format<"date-time">;

	private constructor(data: Classifiable<PostData>) {
		return Object.assign(this, typia.plain.assertClassify<PostData>(data));
	}

	// ---- static factory / creators ------------------------------------------
	static from(data: PostData): Post {
		return new Post(data);
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
		return versionedUpdate(this, patch, Post.from);
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

export { type PostData, Post };
export { Post as PostModel };
