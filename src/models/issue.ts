import type { UUID } from "crypto";
import typia, { type tags } from "typia";
import { Aggregable } from "@/capacities/aggregable";
import { Clonable } from "@/capacities/clonable";
import { Comparable } from "@/capacities/comparable";
import { Immutable } from "@/capacities/immutable";
import { JsonSerialisable } from "@/capacities/json-serialisable";
import { Meterable } from "@/capacities/meterable";
import { ProtobufEncodable } from "@/capacities/protobuf-encodable";
import { Queriable } from "@/capacities/queriable";
import { Randomisable } from "@/capacities/randomisable";
import { Referencible } from "@/capacities/referencible";
import { Servable } from "@/capacities/servable";
import { Siftable } from "@/capacities/siftable";
import { Validatable } from "@/capacities/validatable";
import {
	Identifiable,
	type IdentifiableSchema,
} from "../capacities/identifiable";
import type { SqlSchemaModule } from "../capacities/sql-serialisable";
import { SqlSerialisable } from "../capacities/sql-serialisable";
import { Timestamped, type TimestampedSchema } from "../capacities/timestamped";
import type { Reference } from "../tags/reference";
import { defineModel } from "./base";

/**
 * Issue — a tracked work item in a `Repository` (mirrors
 * `packages/forgejo/models/issues/issue.go` `Issue`). In Forgejo an issue and a
 * pull request share the same table (`is_pull` discriminates); this draft models
 * the shared `issue` row and keeps the PR-specific columns (`head`/`base` refs,
 * merged flags) out for a later `pull_request` model.
 *
 * Only the SQL-PERSISTED subset of Forgejo's `Issue` is carried here. The
 * struct's `xorm:"-"` fields (`Repo`, `Poster`, `Labels`, `Comments`,
 * `Reactions`, `Assignees`, `Milestone`, `Project`, `PullRequest`, …) are
 * derived/loaded relations or in-memory caches — they are NOT columns, so they
 * are omitted. FK columns to models that do not exist yet (`Milestone`,
 * `Label`) are kept as plain nullable columns (no `Reference` tag) so the
 * SQL projection stays serialisable; tighten them once those models land.
 */
interface IssueSchema extends IdentifiableSchema<UUID>, TimestampedSchema {
	// --- routing / ownership (forgejo issue.go:91-95) ---
	/** Owning repository — FK to `Repository`. Owner side (`getRepo()`). */
	repoId: UUID &
		Reference<
			"RepositorySchema",
			"id",
			"many-to-one",
			"cascade",
			"left",
			"repo"
		>;

	/**
	 * Issue number WITHIN the repository (`{owner}/{repo}/issues/{index}`).
	 * Mirrors Forgejo `Index` — unique together with `repo_id`
	 * (`UNIQUE(repo_index)` on the `issue` table).
	 */
	index: number & tags.Minimum<1>;

	/** Author — FK to `User`. Owner side (`getPoster()`). */
	posterId: UUID &
		Reference<
			"UserSchema",
			"id",
			"many-to-one",
			"cascade",
			"left",
			"poster"
		>;

	// --- migrated-author bookkeeping (forgejo issue.go:97-98) ---
	/** Original author name for migrated issues (Forgejo `OriginalAuthor`). */
	originalAuthor?: string & tags.MaxLength<255>;
	/** Original author ID for migrated issues (Forgejo `OriginalAuthorID`). */
	originalAuthorId?: number;

	// --- content (forgejo issue.go:99-102) ---
	/** Issue title. Mirrors Forgejo `Title`. */
	title: string & tags.MinLength<1> & tags.MaxLength<255>;
	/** Issue body / description (markdown source). Mirrors Forgejo `Content`. */
	content: string;
	/** Content revision — guards against lost-update edits (Forgejo `ContentVersion`). */
	contentVersion?: number;

	// --- lifecycle (forgejo issue.go:113-115, 121-127) ---
	/** Whether the issue is closed. Mirrors Forgejo `IsClosed`. */
	isClosed: boolean;
	/** Whether the row is a pull request (shares the `issue` table). */
	isPull: boolean;
	/** Locked: only users with write access may comment. Mirrors Forgejo `IsLocked`. */
	isLocked?: boolean;

	// --- counters / misc (forgejo issue.go:117-119) ---
	/** Number of comments. Mirrors Forgejo `NumComments`. */
	numComments?: number;
	/** Branch ref for pull requests. Mirrors Forgejo `Ref`. */
	ref?: string & tags.MaxLength<255>;
	/** Pinned position (0 = not pinned). Mirrors Forgejo `PinOrder`. */
	pinOrder?: number & tags.Minimum<0>;

	// --- milestone / priority (forgejo issue.go:105-109) ---
	/**
	 * Owning milestone. FK to a future `Milestone` model — kept as a plain
	 * nullable column for now (no `Reference` tag yet).
	 */
	milestoneId?: number | null;
	/** Issue priority. Mirrors Forgejo `Priority`. */
	priority?: number;

	// --- timestamps (unix seconds; `created_at` comes from Timestamped) ---
	/** Last-update unix timestamp. Mirrors Forgejo `UpdatedUnix`. */
	updatedUnix?: number;
	/** Close unix timestamp (0 while open). Mirrors Forgejo `ClosedUnix`. */
	closedUnix?: number;
	/** Optional due date unix timestamp. Mirrors Forgejo `DeadlineUnix`. */
	deadlineUnix?: number;
}

const issueLess = typia.compare.createLess<IssueSchema>();

const IssueSchemaModule: SqlSchemaModule<IssueSchema> = {
	schema: typia.json.schema<IssueSchema>(),
	classify: typia.plain.createClassify<IssueSchema>(),
	assertClassify: typia.plain.createAssertClassify<IssueSchema>(),
	validateClassify: typia.plain.createValidateClassify<IssueSchema>(),
	clone: typia.plain.createClone<IssueSchema>(),
	assertClone: typia.plain.createAssertClone<IssueSchema>(),
	isClone: typia.plain.createIsClone<IssueSchema>(),
	validateClone: typia.plain.createValidateClone<IssueSchema>(),
	prune: typia.plain.createPrune<IssueSchema>(),
	is: typia.createIs<IssueSchema>(),
	assert: typia.createAssert<IssueSchema>(),
	assertGuard: typia.createAssertGuard<IssueSchema>(),
	validate: typia.createValidate<IssueSchema>(),
	assertEquals: typia.createAssertEquals<IssueSchema>(),
	validateEquals: typia.createValidateEquals<IssueSchema>(),
	assertGuardEquals: typia.createAssertGuardEquals<IssueSchema>(),
	assertGuardValidate: typia.createAssertGuard<IssueSchema>(),
	stringify: typia.json.createStringify<IssueSchema>(),
	toJSON: typia.json.createAssertStringify<IssueSchema>(),
	isStringify: typia.json.createIsStringify<IssueSchema>(),
	validateStringify: typia.json.createValidateStringify<IssueSchema>(),
	fromJSON: typia.json.createAssertParse<IssueSchema>(),
	isParse: typia.json.createIsParse<IssueSchema>(),
	validateParse: typia.json.createValidateParse<IssueSchema>(),
	message: typia.protobuf.message<IssueSchema>(),
	encode: typia.protobuf.createAssertEncode<IssueSchema>(),
	decode: typia.protobuf.createAssertDecode<IssueSchema>(),
	isEncode: typia.protobuf.createIsEncode<IssueSchema>(),
	validateEncode: typia.protobuf.createValidateEncode<IssueSchema>(),
	isDecode: typia.protobuf.createIsDecode<IssueSchema>(),
	validateDecode: typia.protobuf.createValidateDecode<IssueSchema>(),
	equals: typia.compare.createEquals<IssueSchema>(),
	less: issueLess,
	more: (x: any, y: any) => issueLess(y, x),
	random: typia.createRandom<IssueSchema>(),
};

/**
 * IssueModel — the classified constructor base PLUS its composed capacities.
 * `SqlSerialisable` derives the drizzle `issues` table + the `repoId` / `posterId`
 * FKs (via the `Reference` tags); `Referencible` derives `getRepo()` / `getPoster()`;
 * `Validatable` asserts on new + update; `Queriable` + `Siftable` give schema-driven
 * filtering + cursor pagination; `Servable` generates `GET /issues` + `GET /issues/:id`;
 * `Aggregable` adds `GET /issues/aggregate`.
 */
const IssueModel = defineModel<IssueSchema>({
	schemaName: "IssueSchema",
	schemaModule: IssueSchemaModule,
	capacities: [
		Identifiable,
		Timestamped,
		JsonSerialisable,
		ProtobufEncodable,
		Clonable,
		Comparable,
		{
			capacity: SqlSerialisable,
			options: { name: "issues", dialect: "sqlite" },
		},
		{
			capacity: Referencible,
			options: { relations: [] },
		},
		{ capacity: Validatable, options: { onNew: "assert", onUpdate: "assert" } },
		Queriable,
		{
			capacity: Siftable,
			options: { sort: { field: "created_at", dir: "desc" } },
		},
		{
			capacity: Servable,
			options: { sort: { field: "created_at", dir: "desc" } },
		},
		{
			capacity: Aggregable,
			options: { path: "/issues/aggregate" },
		},
		Randomisable,
		{ capacity: Meterable, options: { name: "Issue" } },
		// Immutable (LAST — outermost mixin): `update` reconstructs a new frozen
		// instance; freeze runs after every inner constructor populated fields.
		Immutable,
	],
});

class Issue extends IssueModel {
	declare repoId: UUID;
	declare index: number;
	declare posterId: UUID;
	declare originalAuthor?: string;
	declare originalAuthorId?: number;
	declare title: string;
	declare content: string;
	declare contentVersion?: number;
	declare isClosed: boolean;
	declare isPull: boolean;
	declare isLocked?: boolean;
	declare numComments?: number;
	declare ref?: string;
	declare pinOrder?: number;
	declare milestoneId?: number | null;
	declare priority?: number;
	declare updatedUnix?: number;
	declare closedUnix?: number;
	declare deadlineUnix?: number;
}

export { Issue, IssueModel, type IssueSchema, IssueSchemaModule };
