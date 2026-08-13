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
 * Reply — a BBS reply/message (回帖). Belongs to a `Thread`, authored by a
 * `User`, and may be a NESTED reply to another `Reply` via the self-referencing
 * `parentId` FK. `thread.getReplies()` returns the top-level replies; the
 * self-reference `reply.getChildren()`/`getParent()` walks the tree.
 *
 * `parentId` is optional (`undefined` = top-level in the thread). It is a
 * self-reference to `ReplySchema`, so `Referencible` derives `getParent()`
 * (owner side) and we declare the inverse `getChildren()` manually.
 */
interface ReplySchema extends IdentifiableSchema<UUID>, TimestampedSchema {
	/** Thread this reply belongs to — FK to `Thread` (owner side). */
	threadId: UUID &
		Reference<"ThreadSchema", "id", "many-to-one", "cascade", "inner">;

	/** Reply author — FK to `User` (owner side; accessor `getAuthor()`). */
	authorId: UUID &
		Reference<"UserSchema", "id", "many-to-one", "cascade", "inner", "author">;

	/** Optional parent reply (self-reference) for nested threading.
	 *  Accessor `getParent()` (named via the 6th `Reference` type param). */
	parentId?: UUID &
		Reference<"ReplySchema", "id", "many-to-one", "cascade", "left", "parent">;

	/** Reply body / content. */
	body: string & tags.MinLength<1> & tags.MaxLength<20000>;
}

const replyLess = typia.compare.createLess<ReplySchema>();

const ReplySchemaModule: SqlSchemaModule<ReplySchema> = {
	schema: typia.json.schema<ReplySchema>(),
	classify: typia.plain.createClassify<ReplySchema>(),
	assertClassify: typia.plain.createAssertClassify<ReplySchema>(),
	validateClassify: typia.plain.createValidateClassify<ReplySchema>(),
	clone: typia.plain.createClone<ReplySchema>(),
	assertClone: typia.plain.createAssertClone<ReplySchema>(),
	isClone: typia.plain.createIsClone<ReplySchema>(),
	validateClone: typia.plain.createValidateClone<ReplySchema>(),
	is: typia.createIs<ReplySchema>(),
	assert: typia.createAssert<ReplySchema>(),
	assertGuard: typia.createAssertGuard<ReplySchema>(),
	validate: typia.createValidate<ReplySchema>(),
	assertEquals: typia.createAssertEquals<ReplySchema>(),
	validateEquals: typia.createValidateEquals<ReplySchema>(),
	assertGuardEquals: typia.createAssertGuardEquals<ReplySchema>(),
	assertGuardValidate: typia.createAssertGuard<ReplySchema>(),
	stringify: typia.json.createStringify<ReplySchema>(),
	toJSON: typia.json.createAssertStringify<ReplySchema>(),
	isStringify: typia.json.createIsStringify<ReplySchema>(),
	validateStringify: typia.json.createValidateStringify<ReplySchema>(),
	fromJSON: typia.json.createAssertParse<ReplySchema>(),
	isParse: typia.json.createIsParse<ReplySchema>(),
	validateParse: typia.json.createValidateParse<ReplySchema>(),
	message: typia.protobuf.message<ReplySchema>(),
	encode: typia.protobuf.createAssertEncode<ReplySchema>(),
	decode: typia.protobuf.createAssertDecode<ReplySchema>(),
	isEncode: typia.protobuf.createIsEncode<ReplySchema>(),
	validateEncode: typia.protobuf.createValidateEncode<ReplySchema>(),
	isDecode: typia.protobuf.createIsDecode<ReplySchema>(),
	validateDecode: typia.protobuf.createValidateDecode<ReplySchema>(),
	equals: typia.compare.createEquals<ReplySchema>(),
	less: replyLess,
	more: (x: any, y: any) => replyLess(y, x),
	random: typia.createRandom<ReplySchema>(),
};

/**
 * ReplyModel — capacities mirror `Board`/`Thread`. Relations:
 *   - `threadId` / `authorId` — owner-side FK tags → derived `getThread()` /
 *     `getAuthor()`;
 *   - `parentId` — owner-side SELF-reference tag → derived `getParent()`;
 *   - `getChildren()` — manual inverse collection (same model), string-target.
 */
const ReplyModel = defineModel<ReplySchema>({
	schemaName: "ReplySchema",
	schemaModule: ReplySchemaModule,
	capacities: [
		Identifiable,
		Timestamped,
		JsonSerialisable,
		ProtobufEncodable,
		Clonable,
		Comparable,
		{
			capacity: SqlSerialisable,
			options: { name: "replies", dialect: "sqlite" },
		},
		{
			capacity: Referencible,
			options: {
				relations: [
					{
						// Inverse self-collection: FK `parentId` is on other replies.
						// `undefined` parentId must not match — the manual spec uses a
						// function predicate so only replies WITH a parentId join.
						name: "children",
						target: () => "ReplySchema",
						by: (candidate: any, self: any) =>
							candidate.parentId != null && candidate.parentId === self.id,
						cardinality: "one-to-many",
						onDelete: "noAction",
					},
				],
			},
		},
		{ capacity: Validatable, options: { onNew: "assert", onUpdate: "assert" } },
		Queriable,
		{
			capacity: Siftable,
			options: { sort: { field: "created_at", dir: "asc" } },
		},
		Randomisable,
		{ capacity: Meterable, options: { name: "Reply" } },
	],
});

class Reply extends ReplyModel {
	declare threadId: UUID;
	declare authorId: UUID;
	declare parentId?: UUID;
	declare body: string;
}

export { Reply, ReplyModel, type ReplySchema, ReplySchemaModule };
