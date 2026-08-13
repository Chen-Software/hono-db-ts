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
 * Thread — a BBS topic/thread (主题帖). Belongs to a `Board`, authored by a
 * `User`, and collects `Reply`s (inverse relation `thread.getReplies()`).
 *
 * A thread is MUTABLE (unlike `Post`'s content-addressed versions): title edits,
 * pinning, locking are all in-place state changes. `updated_at` therefore means
 * "last activity" and is bumped by `touch()` rather than being a version. The
 * `pinned` / `locked` aggregate methods enforce their invariants on the class.
 */
interface ThreadSchema extends IdentifiableSchema<UUID>, TimestampedSchema {
	/** Last activity timestamp — bumped by `touch()`. */
	updated_at: string & tags.Format<"date-time">;

	/** Board this thread belongs to — FK to `Board` (owner side). */
	boardId: UUID &
		Reference<"BoardSchema", "id", "many-to-one", "cascade", "inner">;

	/** Thread author — FK to `User` (owner side; accessor `getAuthor()`). */
	authorId: UUID &
		Reference<"UserSchema", "id", "many-to-one", "cascade", "inner", "author">;

	/** Thread title. */
	title: string & tags.MinLength<1> & tags.MaxLength<300>;

	/** Pinned to the top of its board. */
	pinned: boolean;

	/** Locked — no new replies allowed. */
	locked: boolean;
}

const threadLess = typia.compare.createLess<ThreadSchema>();

const ThreadSchemaModule: SqlSchemaModule<ThreadSchema> = {
	schema: typia.json.schema<ThreadSchema>(),
	classify: typia.plain.createClassify<ThreadSchema>(),
	assertClassify: typia.plain.createAssertClassify<ThreadSchema>(),
	validateClassify: typia.plain.createValidateClassify<ThreadSchema>(),
	clone: typia.plain.createClone<ThreadSchema>(),
	assertClone: typia.plain.createAssertClone<ThreadSchema>(),
	isClone: typia.plain.createIsClone<ThreadSchema>(),
	validateClone: typia.plain.createValidateClone<ThreadSchema>(),
	is: typia.createIs<ThreadSchema>(),
	assert: typia.createAssert<ThreadSchema>(),
	assertGuard: typia.createAssertGuard<ThreadSchema>(),
	validate: typia.createValidate<ThreadSchema>(),
	assertEquals: typia.createAssertEquals<ThreadSchema>(),
	validateEquals: typia.createValidateEquals<ThreadSchema>(),
	assertGuardEquals: typia.createAssertGuardEquals<ThreadSchema>(),
	assertGuardValidate: typia.createAssertGuard<ThreadSchema>(),
	stringify: typia.json.createStringify<ThreadSchema>(),
	toJSON: typia.json.createAssertStringify<ThreadSchema>(),
	isStringify: typia.json.createIsStringify<ThreadSchema>(),
	validateStringify: typia.json.createValidateStringify<ThreadSchema>(),
	fromJSON: typia.json.createAssertParse<ThreadSchema>(),
	isParse: typia.json.createIsParse<ThreadSchema>(),
	validateParse: typia.json.createValidateParse<ThreadSchema>(),
	message: typia.protobuf.message<ThreadSchema>(),
	encode: typia.protobuf.createAssertEncode<ThreadSchema>(),
	decode: typia.protobuf.createAssertDecode<ThreadSchema>(),
	isEncode: typia.protobuf.createIsEncode<ThreadSchema>(),
	validateEncode: typia.protobuf.createValidateEncode<ThreadSchema>(),
	isDecode: typia.protobuf.createIsDecode<ThreadSchema>(),
	validateDecode: typia.protobuf.createValidateDecode<ThreadSchema>(),
	equals: typia.compare.createEquals<ThreadSchema>(),
	less: threadLess,
	more: (x: any, y: any) => threadLess(y, x),
	random: typia.createRandom<ThreadSchema>(),
};

/**
 * ThreadModel — capacities mirror `Board`, with the added `boardId`/`authorId`
 * FK relations (both owner-side, DERIVED accessors `getBoard()` / `getAuthor()`)
 * and the inverse `getReplies()` collection (string-target, since `Reply`
 * imports this module).
 */
const ThreadModel = defineModel<ThreadSchema>({
	schemaName: "ThreadSchema",
	schemaModule: ThreadSchemaModule,
	capacities: [
		Identifiable,
		Timestamped,
		JsonSerialisable,
		ProtobufEncodable,
		Clonable,
		Comparable,
		{
			capacity: SqlSerialisable,
			options: { name: "threads", dialect: "sqlite" },
		},
		{
			capacity: Referencible,
			options: {
				relations: [
					{
						// Inverse collection: FK `threadId` lives on `Reply`.
						name: "replies",
						target: () => "ReplySchema",
						by: "threadId",
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
			options: { sort: { field: "updated_at", dir: "desc" } },
		},
		Randomisable,
		{ capacity: Meterable, options: { name: "Thread" } },
	],
});

/** Domain invariant violation — e.g. locking a locked thread. */
export class InvalidThreadStateError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InvalidThreadStateError";
	}
}

class Thread extends ThreadModel {
	declare updated_at: string;
	declare boardId: UUID;
	declare authorId: UUID;
	declare title: string;
	declare pinned: boolean;
	declare locked: boolean;

	/** Pin this thread (idempotent-safe). */
	pin(): this {
		if (this.pinned)
			throw new InvalidThreadStateError("Thread is already pinned");
		return this.update({ pinned: true, updated_at: new Date().toISOString() });
	}

	unpin(): this {
		if (!this.pinned) throw new InvalidThreadStateError("Thread is not pinned");
		return this.update({ pinned: false, updated_at: new Date().toISOString() });
	}

	/** Lock — no new replies. */
	lock(): this {
		if (this.locked)
			throw new InvalidThreadStateError("Thread is already locked");
		return this.update({ locked: true, updated_at: new Date().toISOString() });
	}

	unlock(): this {
		if (!this.locked) throw new InvalidThreadStateError("Thread is not locked");
		return this.update({ locked: false, updated_at: new Date().toISOString() });
	}

	/** Record activity (a new reply, an edit) — bumps `updated_at`. */
	touch(): this {
		return this.update({ updated_at: new Date().toISOString() });
	}
}

export { Thread, ThreadModel, type ThreadSchema, ThreadSchemaModule };
