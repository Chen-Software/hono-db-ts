import type { UUID } from "crypto";
import typia, { type Classifiable, type tags } from "typia";
import { Clonable } from "@/capacities/clonable";
import { Comparable } from "@/capacities/comparable";
import { JsonSerialisable } from "@/capacities/json-serialisable";
import { ProtobufEncodable } from "@/capacities/protobuf-encodable";
import { Validatable } from "@/capacities/validatable";
import { Referencible } from "@/capacities/referencible";
import { SqlSerialisable } from "../capacities/sql-serialisable";
import type { SqlSchemaModule } from "../capacities/sql-tablisable";
import type { IdentifiableSchema } from "../capacities/identifiable";
import type { Timestamped } from "../capacities/timestamped";
import { defineModel } from "./base";
import { Post } from "./post";

/**
 * User schema — the plain-data contract.
 *
 * Extends the type-level capacity markers `IdentifiableSchema<UUID>` (a `uuid`
 * `id`) and `Timestamped` (a `created_at`). All field constraints live here;
 * typia resolves this interface directly (it is NOT a class), which is exactly
 * what the JSON (de)serialisers and `assertClassify` below need.
 */
interface UserSchema extends IdentifiableSchema<UUID>, Timestamped {
	/** Name of the user. */
	name: string & tags.MinLength<1> & tags.MaxLength<100>;

	/** Email address of the user. */
	email: string & tags.Format<"email"> & tags.MaxLength<255>;

	/** User role for permission and access control. */
	role: "admin" | "member" | "viewer";

	/** Age of the user. */
	age: number &
		tags.Type<"uint32"> &
		tags.ExclusiveMinimum<19> &
		tags.Maximum<100>;
}

/**
 * `User`'s relational projection is DERIVED, not hand-written: the
 * `SqlSerialisable` capacity builds the drizzle tables + `toRow`/`fromRow`
 * mappers from the reflected `UserSchema` at composition time (see
 * `capacities/sql-tablisable.ts`). The model binds zero drizzle column code,
 * and the derived `sql` (primary dialect) / `sqlPg` (opposite dialect) slices
 * are what `SqlBackend` / `UserRepo.overSql` consume. The capacity also LIFTS
 * `User.table` / `User.toRow` / `User.fromRow` onto the class.
 */

/**
 * UserSchemaModule — the FIXED bundle of every typia function `User` needs,
 * bound ONCE and concretely here (where `UserSchema` is real). `defineModel`
 * hands this single module to every capacity; each capacity pulls its own
 * slice (`JsonSerialisable` → `toJSON`/`fromJSON`, `ProtobufEncodable` →
 * `encode`/`decode`/`message`) and ignores the rest. The base model itself
 * consumes `schema` and `classify`.
 */
// compare family (typia.compare.*) — bound once, consumed by the Comparable capacity
const userEquals = typia.compare.createEquals<UserSchema>();
const userLess = typia.compare.createLess<UserSchema>();

const UserSchemaModule: SqlSchemaModule<UserSchema> = {
	schema: typia.reflect.schema<UserSchema>(),
	// classify family (plain default; Validatable upgrades construction to assertClassify)
	classify: typia.plain.createClassify<UserSchema>(),
	assertClassify: typia.plain.createAssertClassify<UserSchema>(),
	validateClassify: typia.plain.createValidateClassify<UserSchema>(),
	// clone family
	clone: typia.plain.createClone<UserSchema>(),
	assertClone: typia.plain.createAssertClone<UserSchema>(),
	isClone: typia.plain.createIsClone<UserSchema>(),
	validateClone: typia.plain.createValidateClone<UserSchema>(),
	// validators
	is: typia.createIs<UserSchema>(),
	assert: typia.createAssert<UserSchema>(),
	assertGuard: typia.createAssertGuard<UserSchema>(),
	validate: typia.createValidate<UserSchema>(),
	"assert-equals": typia.createAssertEquals<UserSchema>(),
	"validate-equals": typia.createValidateEquals<UserSchema>(),
	"assert-guard-equals": typia.createAssertGuardEquals<UserSchema>(),
	"assert-guard-validate": typia.createAssertGuard<UserSchema>(),
	// json family
	stringify: typia.json.createStringify<UserSchema>(),
	toJSON: typia.json.createAssertStringify<UserSchema>(),
	isStringify: typia.json.createIsStringify<UserSchema>(),
	validateStringify: typia.json.createValidateStringify<UserSchema>(),
	fromJSON: typia.json.createAssertParse<UserSchema>(),
	isParse: typia.json.createIsParse<UserSchema>(),
	validateParse: typia.json.createValidateParse<UserSchema>(),
	// protobuf family
	message: typia.protobuf.message<UserSchema>(),
	encode: typia.protobuf.createAssertEncode<UserSchema>(),
	decode: typia.protobuf.createAssertDecode<UserSchema>(),
	isEncode: typia.protobuf.createIsEncode<UserSchema>(),
	validateEncode: typia.protobuf.createValidateEncode<UserSchema>(),
	isDecode: typia.protobuf.createIsDecode<UserSchema>(),
	validateDecode: typia.protobuf.createValidateDecode<UserSchema>(),
	// compare family (typia.compare.*)
	equals: userEquals,
	less: userLess,
	more: (x: any, y: any) => userLess(y, x),
	// random
	random: typia.createRandom<UserSchema>(),
	// NOTE: `sql` / `sqlPg` are intentionally NOT bound here — the
	// `SqlSerialisable` capacity derives them from `schema` (reflected above)
	// at composition time.
};

/**
 * UserModel — the classified constructor base PLUS its composed capacities,
 * produced declaratively by the shared {@link defineModel} base model.
 *
 * `defineModel` supplies the `assertClassify` constructor (`schemaModule.classify`)
 * and the runtime `schemaName` (`"UserSchema"`) / `schema` (reflect object),
 * then folds the declared capacities (below) onto it. `Capable` is
 * auto-prepended, so the only capacities the model names are the behavioural
 * ones:
 *   - `JsonSerialisable` — JSON (de)serialisation (`toJSON` / `fromJSON` +
 *     a JSON-override constructor), pulled from `UserSchemaModule`;
 *   - `ProtobufEncodable` — protobuf (de)serialisation (`encode` / `decode` /
 *     `message`), pulled from `UserSchemaModule`;
 *   - `SqlSerialisable` — derives the relational projection from the reflected
 *     `UserSchema` (into `UserSchemaModule.sql` / `.sqlPg`) AND lifts
 *     `User.table` / `User.toRow` / `User.fromRow` (+ instance `toRow()`) onto
 *     the class. `name` is required (the table name); `dialect` picks the
 *     primary projection.
 */
const UserModel = defineModel<UserSchema>({
	schemaName: "UserSchema",
	schemaModule: UserSchemaModule,
	capacities: [
		JsonSerialisable,
		ProtobufEncodable,
		{ capacity: SqlSerialisable, options: { name: "users", dialect: "sqlite" } },
		// Validatable pulls its validators from `UserSchemaModule`; here we
		// demonstrate BOTH lifecycle hooks: `onNew` (assert on construction) and
		// `onUpdate` (assert on the mutable `update`). The `validate` / `assert`
		// / `assertGuard` overrides default to the structural module functions —
		// swap any to a `*-equals` / `*-guard` variant to tighten them (see
		// src/capacities/validatable.test.ts). User does NOT wear `Immutable`, so
		// its `update` is IN-PLACE (the base default); immutability is an
		// opt-in capacity. Version-bumping on update is a separate `Versioned`
		// concern (see `createVersionedUpdate(User)`), not enforced here.
		{ capacity: Validatable, options: { onNew: "assert", onUpdate: "assert" } },
		// Clonable defaults to the validated `assertClone` because Validatable is
		// present; set `{ capacity: Clonable, options: { clone: "clone" } }` to
		// opt out of validation on clone.
		Clonable,
		// Comparable pulls `equals` / `less` / `more` from `UserSchemaModule`.
		// Because `Validatable` is also declared, `equals` defaults to the
		// validator-aware ("validated") mode — it rejects invalid operands.
		Comparable,
		// Referencible: `user.getPosts()` scans the Post identity map for
		// `authorId === user.id`. `onDelete: "cascade"` registers an `onDelete`
		// hook so deleting a user deletes all its posts first.
		{
			capacity: Referencible,
			options: {
				relations: [
					{ name: "posts", target: () => Post, by: "authorId", cardinality: "one-to-many", onDelete: "cascade" },
				],
			},
		},
	],
});

/**
 * `User` — the model class, extending the processed "caps" class. It adds only
 * model-specific statics (`from`); the capacity behaviour lives on `UserModel`.
 *
 * We intentionally do NOT apply the `Identifiable` / `Validatable` *mixins* here.
 * Their generated constructors expect a `(data, id)` two-arg shape and conflict
 * with `UserSchema` carrying `id` as a field (and with each other). `UserSchema`
 * already extends the `IdentifiableSchema` / `Timestamped` *type* markers, and
 * all validation happens in `UserModel`'s `assertClassify`.
 */
class User extends UserModel {
	/** Construct (or parse-from-JSON) a validated `User`. */
	static from(data: Classifiable<UserSchema> | string): User {
		return new User(data as Classifiable<UserSchema>);
	}
}

export { User, UserModel, UserSchemaModule, type UserSchema };
