import type { UUID } from "crypto";
import typia, { type tags } from "typia";
import { Clonable } from "@/capacities/clonable";
import { Validatable } from "@/capacities/validatable";
import { isProd } from "@/macros/envs" with { type: "macro" };
import { Comparable } from "../capacities/comparable";
import { Hashable } from "../capacities/hashable";
import {
	Identifiable,
	type IdentifiableSchema,
} from "../capacities/identifiable";
import { JsonSerialisable } from "../capacities/json-serialisable";
import { Meterable } from "../capacities/meterable";
import { ProtobufEncodable } from "../capacities/protobuf-encodable";
import { Queriable } from "../capacities/queriable";
import { Randomisable } from "../capacities/randomisable";
import { Referencible } from "../capacities/referencible";
import { SqlSerialisable } from "../capacities/sql-serialisable";
import { Timestamped, type TimestampedSchema } from "../capacities/timestamped";
import { Versionable } from "../capacities/versionable";
import type { Blake3 } from "../tags/format-string-blake3";
import type { Reference } from "../tags/reference";
import { defineModel } from "./base";
import type { UserSchema } from "./user";

/**
 * Post data model.
 *
 * Composes the SAME capacity set as `User` — `Identifiable` (uuid `id`),
 * `Timestamped` (`created_at`), and `Versionable` (`updated_at` doubles as the
 * version timestamp). The only model-specific addition is `author: User`, a
 * nested `User` reference. This is the proof that the capacities are reusable:
 * `Post` gets the identical versioning behaviour (immutable `update` + the
 * `createUpdate` factory) by wiring in the shared `versionableUpdate` helper,
 * with zero capacity changes.
 */
interface PostData
	extends IdentifiableSchema<UUID>,
		TimestampedSchema,
		Versionable,
		Hashable<"body"> {
	/** Post title. */
	title: string & tags.MinLength<1> & tags.MaxLength<200>;

	/** Post body / content. (The `body` field + `contentHash` come from the
	 *  `Hashable<"body">` capacity; the length constraints are added
	 *  here — the intersection accumulates the tags.) */
	body: string & tags.MinLength<1> & tags.MaxLength<10000>;

	/** Author of the post — a nested `UserSchema` (instance or plain data).
	 *  Kept for embedded (de)serialisation convenience; the canonical
	 *  reference is the foreign key below. */
	author: UserSchema;

	/** Foreign key to the authoring `User` — the join column for the
	 *  `getUser` relation. The `Reference` tag is read by `sql-serialisable`
	 *  (from the reflected JSON schema) to wire the drizzle `.references()`
	 *  FK constraint; `Referencible` handles the in-memory side. */
	authorId: UUID &
		Reference<"UserSchema", "id", "many-to-one", "cascade", "inner">;

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
	// Single-type JSON-Schema (NOT the array form): it inlines `PostData`'s
	// `properties` directly on `schema` and carries each `Reference` tag's
	// `x-reference` metadata — exactly what `sql-serialisable` parses to wire FKs.
	schema: typia.json.schema<PostData>(),
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
	assertEquals: typia.createAssertEquals<PostData>(),
	validateEquals: typia.createValidateEquals<PostData>(),
	assertGuardEquals: typia.createAssertGuardEquals<PostData>(),
	assertGuardValidate: typia.createAssertGuard<PostData>(),
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
		Identifiable,
		Timestamped,
		JsonSerialisable,
		ProtobufEncodable,
		Clonable,
		// Prunable,
		Comparable,
		// SqlSerialisable: derives the drizzle `posts` table + row mappers from the
		// schema, and wires the `authorId` FK via the `Reference<"UserSchema">` tag.
		{
			capacity: SqlSerialisable,
			options: { name: "posts", dialect: "sqlite" },
		},
		// Referencible: the `user` relation is now DERIVED from the `Reference`
		// tag on `authorId` above (owner side) — no manual `relations` entry.
		// `post.getUser()` resolves the FK `authorId` to a live User via the
		// identity map (inner join, per the tag's `join: "inner"`). The inverse
		// `user.getPosts()` stays manual on `User` because it has no FK column
		// of its own to tag; its `cardinality` / `onDelete` are guarded against
		// this tag by `Referencible`.
		{
			capacity: Referencible,
			options: { relations: [] },
		},
		// Versionable: gives `Post` the version toolkit (`Post.latestOf`,
		// `post.isNewerThan`, `Post.versionableUpdate`, …) and owns the
		// construction-time `updated_at` default (first version == created_at).
		// The append-only history itself still lives in the PostRepo store.
		Versionable,
		Validatable,
		// Hashable: gives `Post` the content-hash capacity — `post.hash()`,
		// `post.verify()`, `post.address()` — and registers the capacity. The
		// content key is `body`. Construction-time stamping + update re-hash are
		// wired below via `createContentAddressing("body")` (assertBodyHash /
		// updatePost), mirroring how `Versionable` keeps its helpers separate from
		// its own mixin.
		{ capacity: Hashable, options: { key: "body" } },
		// Randomisable: exposes `Post.random()` / `Post.randomSeed()` (typia's
		// `createRandom` bound in PostSchemaModule) as static factories — used by
		// the seed script to generate random, schema-valid posts.
		Randomisable,
		// Queriable: turns `Post` into a queryable entity via `Post.filter(items,
		// query)`. Field semantics are INFERRED from the reflected schema (boolean →
		// eq, number → eq, date → range, array → list, string/uuid → substring) —
		// no hand-written `filterPosts` needed. `created_at`/`updated_at` default to
		// range so `?created_at=[1995-01-01,2000-01-01]` works out of the box
		// (a bare value is an exact day-level match; `[min,max]` is the range).
		Queriable,
		// Meterable: opts `Post`'s repository operations into metrics. Every
		// `PostRepo` op (findById / listLatest / listByAuthor / historyOf /
		// create / append / delete) is timed and recorded as `Post.<op>` —
		// visible in `/debug/operations` (dev) and as `db.client.operations.*`
		// OTEL metrics (prod), reusing the same queryTelemetry sink.
		{ capacity: Meterable, options: { name: "Post" } },
	],
});

/** Domain invariant violation — e.g. publishing an already-published post. */
export class InvalidStateError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InvalidStateError";
	}
}

class Post extends PostBase {
	// NOTE: these are declared with `declare` (type-only) rather than `!`,
	// because `Post` now *extends* the `defineModel` base. Plain `field!`
	// declarations emit a runtime initialiser that runs AFTER `super(data)` and
	// would clobber the data the base constructor just assigned. `declare`
	// contributes the fields to the `implements PostData` type check without
	// emitting any runtime initialiser.
	declare title: string;
	/** Content field — `readonly` because content addressing requires the
	 *  payload to be immutable (you reconstruct, never mutate). Supplied by the
	 *  `Hashable<"body">` capacity. */
	declare readonly body: string;
	declare author: UserSchema;
	declare authorId: UUID;
	declare published: boolean;

	/** Content hash field — supplied by the `Hashable<"body">` capacity. The
	 *  `Hashable` mixin STAMPS it from `body` at construction (and `update`
	 *  re-derives it), so it is always the real BLAKE3 digest of `body`. */
	declare readonly contentHash: string & Blake3;

	// ---- instance methods (prototype) ---------------------------------------

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
}

export { Post, Post as PostModel, type PostData, PostSchemaModule };

// ---------------------------------------------------------------------------
// Content-addressing wiring — `Hashable` names its content key ONCE ("body")
// inside the capacity. The mixin STAMPS `contentHash` at construction and the
// `Versionable` capacity's `update` re-derives it + bumps the version on every
// change (see `src/capacities/hashable.ts` / `versionable.ts`). The model
// declares no `from` / `update` of its own.
// ---------------------------------------------------------------------------
