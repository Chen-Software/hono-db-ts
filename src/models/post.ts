import type { UUID } from "crypto";
import typia, { type Classifiable, type tags } from "typia";
import { isProd } from "@/macros";
import { Comparable } from "../capacities/comparable";
import {
	type ContentAddressable,
	createContentAddressing,
} from "../capacities/content-addressable";
import type { IdentifiableSchema } from "../capacities/identifiable";
import { JsonSerialisable } from "../capacities/json-serialisable";
import { ProtobufEncodable } from "../capacities/protobuf-encodable";
import { Referencible } from "../capacities/referencible";
import type { Timestamped } from "../capacities/timestamped";
import type { Versioned } from "../capacities/versioned";
import type { Blake3 } from "../tags/format-string-blake3";
import { defineModel } from "./base";
import { User, type UserSchema } from "./user";

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
interface PostData
	extends IdentifiableSchema<UUID>,
		Timestamped,
		Versioned,
		ContentAddressable<"body"> {
	/** Post title. */
	title: string & tags.MinLength<1> & tags.MaxLength<200>;

	/** Post body / content. (The `body` field + `hash` come from the
	 *  `ContentAddressable<"body">` capacity; the length constraints are added
	 *  here — the intersection accumulates the tags.) */
	body: string & tags.MinLength<1> & tags.MaxLength<10000>;

	/** Author of the post — a nested `UserSchema` (instance or plain data).
	 *  Kept for embedded (de)serialisation convenience; the canonical
	 *  reference is the foreign key below. */
	author: UserSchema;

	/** Foreign key to the authoring `User` — the join column for the
	 *  `getUser` relation. */
	authorId: UUID;

	/** Whether the post is published. */
	published: boolean;
}

/**
 * HTTP ingest DTOs — the *shapes* a `Post` accepts off the wire. These are
 * deliberately separate from `PostData` (the persisted shape): a query string
 * is not a post. typia's `http` decoder coerces strings → number/boolean and
 * validates the structural shape; the model's own validators still gate the
 * *body*. Bound into `PostSchemaModule.http` (see below) so handlers can decode
 * requests purely, with zero hand-rolled parsing.
 */
/** `GET /posts?limit=…&published=…&tags=…` */
interface PostQuery {
	limit?: number;
	published?: boolean;
	tags?: string[];
}
/** `GET /posts` with `x-locale: en|de` (lowercase — typia normalises). */
interface PostHeaders {
	"x-locale": "en" | "de";
}

// static reusable functions
const cloneFn = typia.plain.createAssertClone<PostData>();
const pruneFn = typia.plain.createAssertPrune<PostData>();

// compare family (typia.compare.*) — bound once, consumed by the Comparable capacity
const postEquals = typia.compare.createEquals<PostData>();
const postLess = typia.compare.createLess<PostData>();

/**
 * PostSchemaModule — the FIXED bundle of every typia function `Post` needs,
 * bound ONCE and concretely here (where `PostData` is real). Fed to every
 * capacity during composition; `JsonSerialisable` and `ProtobufEncodable`
 * each pull their slice and ignore the rest. The base model consumes `schema`
 * and `classify`.
 */
const PostSchemaModule = {
	schema: typia.json.schema<[PostData]>(),
	// Post keeps the validating `assertClassify` as its construction classify
	// (it has no `Validatable` capacity to upgrade it), plus the other variants.
	classify: typia.plain.createAssertClassify<PostData>(),
	assertClassify: typia.plain.createAssertClassify<PostData>(),
	validateClassify: typia.plain.createValidateClassify<PostData>(),
	// clone family
	clone: typia.plain.createClone<PostData>(),
	assertClone: typia.plain.createAssertClone<PostData>(),
	isClone: typia.plain.createIsClone<PostData>(),
	validateClone: typia.plain.createValidateClone<PostData>(),
	// validators
	is: typia.createIs<PostData>(),
	assert: typia.createAssert<PostData>(),
	assertGuard: typia.createAssertGuard<PostData>(),
	validate: typia.createValidate<PostData>(),
	"assert-equals": typia.createAssertEquals<PostData>(),
	"validate-equals": typia.createValidateEquals<PostData>(),
	"assert-guard-equals": typia.createAssertGuardEquals<PostData>(),
	"assert-guard-validate": typia.createAssertGuard<PostData>(),
	// json family
	stringify: typia.json.createStringify<PostData>(),
	toJSON: typia.json.createAssertStringify<PostData>(),
	isStringify: typia.json.createIsStringify<PostData>(),
	validateStringify: typia.json.createValidateStringify<PostData>(),
	fromJSON: typia.json.createAssertParse<PostData>(),
	isParse: typia.json.createIsParse<PostData>(),
	validateParse: typia.json.createValidateParse<PostData>(),
	// protobuf family
	message: typia.protobuf.message<PostData>(),
	encode: typia.protobuf.createAssertEncode<PostData>(),
	decode: typia.protobuf.createAssertDecode<PostData>(),
	isEncode: typia.protobuf.createIsEncode<PostData>(),
	validateEncode: typia.protobuf.createValidateEncode<PostData>(),
	isDecode: typia.protobuf.createIsDecode<PostData>(),
	validateDecode: typia.protobuf.createValidateDecode<PostData>(),
	// compare family (typia.compare.*)
	equals: postEquals,
	less: postLess,
	more: (x: any, y: any) => postLess(y, x),
	// random
	random: typia.createRandom<PostData>(),
	// http ingest slice (typia.http.* — pure decode, no network). Lets handlers
	// turn a raw query string / headers object / path param into typed DTOs
	// with automatic string→number|boolean coercion.
	http: {
		query: typia.http.createQuery<PostQuery>(),
		assertQuery: typia.http.createAssertQuery<PostQuery>(),
		isQuery: typia.http.createIsQuery<PostQuery>(),
		validateQuery: typia.http.createValidateQuery<PostQuery>(),
		headers: typia.http.createHeaders<PostHeaders>(),
		assertHeaders: typia.http.createAssertHeaders<PostHeaders>(),
		isHeaders: typia.http.createIsHeaders<PostHeaders>(),
		validateHeaders: typia.http.createValidateHeaders<PostHeaders>(),
		parameter: typia.http.createParameter<number>(),
		// NOTE: `formData` is intentionally NOT bound here — `PostData` carries a
		// nested `UserSchema` (`author`), and typia's `http.formData` only allows
		// scalar leaves (boolean | number | string | Blob/File + arrays). A model
		// that accepts multipart form would bind `formData` to a SCALAR-ONLY DTO
		// (e.g. `PostForm`), not to its persisted shape. The `HttpSchemaModule`
		// interface still declares the `formData` family for those models.
	},
};

/**
 * Post class — same shape contract as `User`:
 * - static members mirror the typia model API (`Post.is`, `Post.validate`,
 *   `Post.from`, `Post.clone`, `Post.toJSON`, `Post.encode`, ...);
 * - `Post.from` returns a `Post` *instance* with bound methods;
 * - `author` is carried through untouched, so a `User` instance passed in
 *   keeps its own methods (e.g. `post.author.update(...)`). Typed as
 *   `UserSchema` (the plain-data contract) so typia can resolve it.
 */
const PostBase = defineModel<PostData>({
	schemaName: "PostData",
	schemaModule: PostSchemaModule,
	capacities: [
		JsonSerialisable,
		ProtobufEncodable,
		Comparable,
		// Referencible: `post.getUser()` resolves the FK `authorId` to a live
		// User via the identity map. `by: "authorId"` desugars to
		// `(near, far) => near.authorId === far.id`, which also serves the
		// inverse `user.getPosts()` scan.
		{
			capacity: Referencible,
			options: {
				relations: [
					{
						name: "user",
						target: () => User,
						by: "authorId",
						cardinality: "many-to-one",
						join: "inner",
					},
				],
			},
		},
	],
});

/** Domain invariant violation — e.g. publishing an already-published post. */
export class InvalidStateError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InvalidStateError";
	}
}

class Post extends PostBase implements PostData {
	// NOTE: these are declared with `declare` (type-only) rather than `!`,
	// because `Post` now *extends* the `defineModel` base. Plain `field!`
	// declarations emit a runtime initializer that runs AFTER `super(data)` and
	// would clobber the data the base constructor just assigned. `declare`
	// contributes the fields to the `implements PostData` type check without
	// emitting any runtime initializer.
	declare id: UUID;
	declare title: string;
	/** Content field — `readonly` because content addressing requires the
	 *  payload to be immutable (you reconstruct, never mutate). Supplied by the
	 *  `ContentAddressable<"body">` capacity. */
	declare readonly body: string;
	declare author: UserSchema;
	declare authorId: UUID;
	declare published: boolean;
	declare created_at: string;

	/** Version timestamp — strictly increases on every update; equals `created_at` on the first version. This field IS the version. */
	declare updated_at: string & tags.Format<"date-time">;

	/** BLAKE3 content address of `body` — `readonly`; always derived from
	 *  `body` by `createAssertHash` (construction) or `updateHash` (update).
	 *  Supplied by the `ContentAddressable<"body">` capacity. */
	declare readonly hash: string & Blake3;

	private constructor(data: Classifiable<PostData>) {
		super(data);
	}

	// ---- static factory / creators ------------------------------------------
	static from(data: PostData): Post {
		// The constructor is the single place that STAMPS the content address,
		// because objects are immutable. `assertBodyHash` recomputes `hash`
		// from `body`, overwriting any caller-supplied value.
		return new Post(assertBodyHash(data));
	}

	// ---- instance methods (prototype) ---------------------------------------
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

	/**
	 * Publish this post. The invariant (publish exactly once) lives on the
	 * AGGREGATE, not the service: returns a new published instance, or throws
	 * `InvalidStateError` if already published. The service just calls this and
	 * writes the result — the rule is testable without any ports.
	 */
	publish(): Post {
		if (this.published) {
			throw new InvalidStateError("Post is already published");
		}
		return this.update({ published: true });
	}

	/** JSON string representation. */
	stringify(): string {
		return Post.toJSON(this);
	}

	// `toJSON` / `fromJSON` are provided at RUNTIME by the `JsonSerialisable`
	// capacity (pulled from `PostSchemaModule` during composition), but
	// `defineModel`'s return type is widened to `typeof Model`, which hides them
	// from the checker. `declare` re-teaches the type without emitting a second
	// (conflicting) runtime initializer.
	declare static toJSON: (input: PostData) => string;
	declare static fromJSON: (input: string) => PostData;

	// ---- static functions ---------------------------------------------------
	// NOTE: `toJSON` / `fromJSON` (and JSON-override construction) are provided
	// by the `JsonSerialisable` capacity, which pulls them from PostSchemaModule
	// during composition — no manual JSON statics needed here.
	static random = typia.createRandom<PostData>();
	static is = typia.createIs<PostData>();
	static assert = typia.createAssert<PostData>();
	static validate = typia.createValidate<PostData>();
	static validatePartial = typia.createValidate<Partial<PostData>>();
	static clone = typia.plain.createAssertClone<PostData>();
	static prune = typia.plain.createAssertPrune<PostData>();
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

export { Post, Post as PostModel, type PostData, PostSchemaModule };
