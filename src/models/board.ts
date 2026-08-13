import type { UUID } from "crypto";
import typia, { type tags } from "typia";
import { Clonable } from "@/capacities/clonable";
import { Comparable } from "@/capacities/comparable";
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
 * Board — a BBS forum/board (版块). The top-level container for threads.
 *
 * Follows the exact `User` capacity pattern: `Identifiable` (uuid `id`),
 * `Timestamped` (`created_at`), SQL projection (table `boards`), a
 * `Referencible` inverse relation `board.getThreads()`, and the schema-driven
 * query/pagination capacities. `moderatorId` is a `Reference` FK to `User`, so
 * `board.getModerator()` is DERIVED from the tag (owner side).
 */
interface BoardSchema extends IdentifiableSchema<UUID>, TimestampedSchema {
	/** Display name of the board. */
	name: string & tags.MinLength<1> & tags.MaxLength<80>;

	/** URL-safe slug (unique). */
	slug: string &
		tags.MinLength<1> &
		tags.MaxLength<80> &
		tags.Pattern<"^[a-z0-9]+(?:-[a-z0-9]+)*$">;

	/** Short description shown in the board list. */
	description: string & tags.MinLength<0> & tags.MaxLength<500>;

	/** Moderator of the board — FK to `User`. Owner side (derived accessor
	 *  `getModerator()`, named via the 6th `Reference` type param). */
	moderatorId: UUID &
		Reference<
			"UserSchema",
			"id",
			"many-to-one",
			"setNull",
			"inner",
			"moderator"
		>;
}

const boardLess = typia.compare.createLess<BoardSchema>();

const BoardSchemaModule: SqlSchemaModule<BoardSchema> = {
	schema: typia.json.schema<BoardSchema>(),
	classify: typia.plain.createClassify<BoardSchema>(),
	assertClassify: typia.plain.createAssertClassify<BoardSchema>(),
	validateClassify: typia.plain.createValidateClassify<BoardSchema>(),
	clone: typia.plain.createClone<BoardSchema>(),
	assertClone: typia.plain.createAssertClone<BoardSchema>(),
	isClone: typia.plain.createIsClone<BoardSchema>(),
	validateClone: typia.plain.createValidateClone<BoardSchema>(),
	is: typia.createIs<BoardSchema>(),
	assert: typia.createAssert<BoardSchema>(),
	assertGuard: typia.createAssertGuard<BoardSchema>(),
	validate: typia.createValidate<BoardSchema>(),
	assertEquals: typia.createAssertEquals<BoardSchema>(),
	validateEquals: typia.createValidateEquals<BoardSchema>(),
	assertGuardEquals: typia.createAssertGuardEquals<BoardSchema>(),
	assertGuardValidate: typia.createAssertGuard<BoardSchema>(),
	stringify: typia.json.createStringify<BoardSchema>(),
	toJSON: typia.json.createAssertStringify<BoardSchema>(),
	isStringify: typia.json.createIsStringify<BoardSchema>(),
	validateStringify: typia.json.createValidateStringify<BoardSchema>(),
	fromJSON: typia.json.createAssertParse<BoardSchema>(),
	isParse: typia.json.createIsParse<BoardSchema>(),
	validateParse: typia.json.createValidateParse<BoardSchema>(),
	message: typia.protobuf.message<BoardSchema>(),
	encode: typia.protobuf.createAssertEncode<BoardSchema>(),
	decode: typia.protobuf.createAssertDecode<BoardSchema>(),
	isEncode: typia.protobuf.createIsEncode<BoardSchema>(),
	validateEncode: typia.protobuf.createValidateEncode<BoardSchema>(),
	isDecode: typia.protobuf.createIsDecode<BoardSchema>(),
	validateDecode: typia.protobuf.createValidateDecode<BoardSchema>(),
	equals: typia.compare.createEquals<BoardSchema>(),
	less: boardLess,
	more: (x: any, y: any) => boardLess(y, x),
	random: typia.createRandom<BoardSchema>(),
};

/**
 * BoardModel — the classified constructor base PLUS its composed capacities.
 *
 * Capacities (mirroring `User`): `SqlSerialisable` derives the drizzle `boards`
 * table + the `moderatorId` FK (via the `Reference` tag); `Referencible` derives
 * `getModerator()` from the tag and declares the inverse `getThreads()`
 * collection (FK `boardId` lives on `Thread`); `Validatable` asserts on new +
 * update; `Queriable` + `Siftable` give schema-driven filtering + cursor
 * pagination; `Randomisable` / `Meterable` round it out.
 */
const BoardModel = defineModel<BoardSchema>({
	schemaName: "BoardSchema",
	schemaModule: BoardSchemaModule,
	capacities: [
		Identifiable,
		Timestamped,
		JsonSerialisable,
		ProtobufEncodable,
		Clonable,
		Comparable,
		{
			capacity: SqlSerialisable,
			options: { name: "boards", dialect: "sqlite" },
		},
		{
			capacity: Referencible,
			options: {
				relations: [
					{
						// Inverse collection: the FK `boardId` lives on `Thread`.
						// Target by SCHEMA NAME (string) rather than the class, because
						// `Thread` imports this module — a runtime class cycle. The
						// thunk is resolved lazily at call time via the model registry.
						name: "threads",
						target: () => "ThreadSchema",
						by: "boardId",
						cardinality: "one-to-many",
						onDelete: "cascade",
					},
				],
			},
		},
		{ capacity: Validatable, options: { onNew: "assert", onUpdate: "assert" } },
		Queriable,
		{
			capacity: Siftable,
			options: { sort: { field: "created_at", dir: "desc" } },
		},
		// Servable: generates the SQL-backed Hono routes `GET /boards` +
		// `GET /boards/:id` via `Board.serve(app, client)`, with the same
		// `created_at` desc sort Siftable uses.
		{
			capacity: Servable,
			options: { sort: { field: "created_at", dir: "desc" } },
		},
		Randomisable,
		{ capacity: Meterable, options: { name: "Board" } },
	],
});

class Board extends BoardModel {
	declare name: string;
	declare slug: string;
	declare description: string;
	declare moderatorId: UUID;
}

export { Board, BoardModel, type BoardSchema, BoardSchemaModule };
