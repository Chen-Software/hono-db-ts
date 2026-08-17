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
 * Repository — a Git repository (mirrors `packages/forgejo/models/repo/repo.go`
 * `Repository`). This is the top-level unit of a forge, owned by a `User`
 * (or, later, an `Organization`).
 *
 * Follows the same capacity pattern as `User`: `Identifiable` (uuid `id`),
 * `Timestamped` (`created_at`), SQL projection (table `repositories`), a
 * `Referencible` owner relation `repo.getOwner()` derived from the `ownerId`
 * `Reference` FK, and the schema-driven query/pagination capacities. Domain
 * fields are a *draft* subset of Forgejo's `Repository` struct: `ownerId`,
 * `name`/`lowerName` (the `{owner}/{repo}` routing key), `description`,
 * `defaultBranch`, `website`, the `is*` flags, `topics`, the `num*` counters,
 * `size`, and `status`.
 *
 * NOTE: Forgejo uses `onDelete: cascade` for the owner FK (deleting a user
 * deletes their repos). This draft uses `setNull` + an optional/nullable
 * `ownerId` so the in-memory referential action stays coherent; tighten to
 * `cascade` once the deletion semantics are pinned down.
 */
interface RepositorySchema extends IdentifiableSchema<UUID>, TimestampedSchema {
	/** Owning user — FK to `User`. Owner side (derived accessor `getOwner()`). */
	ownerId?: UUID &
		Reference<
			"UserSchema",
			"id",
			"many-to-one",
			"setNull",
			"left",
			"owner"
		> | null;

	/** Repository name (e.g. "my-repo"). Mirrors Forgejo `Name`. */
	name: string & tags.MinLength<1> & tags.MaxLength<255>;

	/**
	 * Lower-cased name used for case-insensitive `{owner}/{repo}` routing —
	 * unique together with `ownerId`. Mirrors Forgejo `LowerName`.
	 */
	lowerName: string &
		tags.MinLength<1> &
		tags.MaxLength<255> &
		tags.Pattern<"^[a-z0-9]+(?:-[a-z0-9]+)*$">;

	/** Short description. Mirrors Forgejo `Description`. */
	description: string & tags.MaxLength<1000>;

	/** Default branch name (e.g. "main"). Mirrors Forgejo `DefaultBranch`. */
	defaultBranch: string & tags.MinLength<1> & tags.MaxLength<255>;

	/** Homepage URL. Mirrors Forgejo `Website`. */
	website: string & tags.MaxLength<2048>;

	/** Whether the repository is private. Mirrors Forgejo `IsPrivate`. */
	isPrivate: boolean;

	/** Whether the repository is archived (read-only). Mirrors Forgejo `IsArchived`. */
	isArchived: boolean;

	/** Whether the repository is a mirror. Mirrors Forgejo `IsMirror`. */
	isMirror: boolean;

	/** Whether the repository is a template. Mirrors Forgejo `IsTemplate`. */
	isTemplate: boolean;

	/** Git object format (sha1 / sha256). Mirrors Forgejo `ObjectFormatName`. */
	objectFormatName: string & tags.MaxLength<6>;

	/** Topic tags (JSON column). Mirrors Forgejo `Topics`. */
	topics: string[];

	/** Star count. Mirrors Forgejo `NumStars`. */
	numStars: number;

	/** Fork count. Mirrors Forgejo `NumForks`. */
	numForks: number;

	/** Open issue count. */
	numOpenIssues: number;

	/** Closed issue count. */
	numClosedIssues: number;

	/** On-disk size in bytes (git + lfs). Mirrors Forgejo `Size`. */
	size: number;

	/** Avatar hash. Mirrors Forgejo `Avatar`. */
	avatar: string & tags.MaxLength<64>;

	/** Repository status (0 = active). Mirrors Forgejo `Status`. */
	status: number;
}

const repoLess = typia.compare.createLess<RepositorySchema>();

const RepositorySchemaModule: SqlSchemaModule<RepositorySchema> = {
	schema: typia.json.schema<RepositorySchema>(),
	classify: typia.plain.createClassify<RepositorySchema>(),
	assertClassify: typia.plain.createAssertClassify<RepositorySchema>(),
	validateClassify: typia.plain.createValidateClassify<RepositorySchema>(),
	clone: typia.plain.createClone<RepositorySchema>(),
	assertClone: typia.plain.createAssertClone<RepositorySchema>(),
	isClone: typia.plain.createIsClone<RepositorySchema>(),
	validateClone: typia.plain.createValidateClone<RepositorySchema>(),
	prune: typia.plain.createPrune<RepositorySchema>(),
	is: typia.createIs<RepositorySchema>(),
	assert: typia.createAssert<RepositorySchema>(),
	assertGuard: typia.createAssertGuard<RepositorySchema>(),
	validate: typia.createValidate<RepositorySchema>(),
	assertEquals: typia.createAssertEquals<RepositorySchema>(),
	validateEquals: typia.createValidateEquals<RepositorySchema>(),
	assertGuardEquals: typia.createAssertGuardEquals<RepositorySchema>(),
	assertGuardValidate: typia.createAssertGuard<RepositorySchema>(),
	stringify: typia.json.createStringify<RepositorySchema>(),
	toJSON: typia.json.createAssertStringify<RepositorySchema>(),
	isStringify: typia.json.createIsStringify<RepositorySchema>(),
	validateStringify: typia.json.createValidateStringify<RepositorySchema>(),
	fromJSON: typia.json.createAssertParse<RepositorySchema>(),
	isParse: typia.json.createIsParse<RepositorySchema>(),
	validateParse: typia.json.createValidateParse<RepositorySchema>(),
	message: typia.protobuf.message<RepositorySchema>(),
	encode: typia.protobuf.createAssertEncode<RepositorySchema>(),
	decode: typia.protobuf.createAssertDecode<RepositorySchema>(),
	isEncode: typia.protobuf.createIsEncode<RepositorySchema>(),
	validateEncode: typia.protobuf.createValidateEncode<RepositorySchema>(),
	isDecode: typia.protobuf.createIsDecode<RepositorySchema>(),
	validateDecode: typia.protobuf.createValidateDecode<RepositorySchema>(),
	equals: typia.compare.createEquals<RepositorySchema>(),
	less: repoLess,
	more: (x: any, y: any) => repoLess(y, x),
	random: typia.createRandom<RepositorySchema>(),
};

/**
 * RepositoryModel — the classified constructor base PLUS its composed
 * capacities. `SqlSerialisable` derives the drizzle `repositories` table + the
 * `ownerId` FK (via the `Reference` tag); `Referencible` derives `getOwner()`
 * from the tag; `Validatable` asserts on new + update; `Queriable` +
 * `Siftable` give schema-driven filtering + cursor pagination; `Servable`
 * generates `GET /repositories` + `GET /repositories/:id` via
 * `Repository.serve(app, client)`; `Aggregable` adds
 * `GET /repositories/aggregate`.
 */
const RepositoryModel = defineModel<RepositorySchema>({
	schemaName: "RepositorySchema",
	schemaModule: RepositorySchemaModule,
	capacities: [
		Identifiable,
		Timestamped,
		JsonSerialisable,
		ProtobufEncodable,
		Clonable,
		Comparable,
		{
			capacity: SqlSerialisable,
			options: { name: "repositories", dialect: "sqlite" },
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
			options: { path: "/repositories/aggregate" },
		},
		Randomisable,
		{ capacity: Meterable, options: { name: "Repository" } },
		// Immutable (LAST — outermost mixin): `update` reconstructs a new frozen
		// instance; freeze runs after every inner constructor populated fields.
		Immutable,
	],
});

class Repository extends RepositoryModel {
	declare ownerId?: UUID | null;
	declare name: string;
	declare lowerName: string;
	declare description: string;
	declare defaultBranch: string;
	declare website: string;
	declare isPrivate: boolean;
	declare isArchived: boolean;
	declare isMirror: boolean;
	declare isTemplate: boolean;
	declare objectFormatName: string;
	declare topics: string[];
	declare numStars: number;
	declare numForks: number;
	declare numOpenIssues: number;
	declare numClosedIssues: number;
	declare size: number;
	declare avatar: string;
	declare status: number;
}

export {
	Repository,
	RepositoryModel,
	type RepositorySchema,
	RepositorySchemaModule,
};
