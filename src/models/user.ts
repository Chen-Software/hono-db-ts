import type { UUID } from "crypto";
import typia, { type tags, type Classifiable } from "typia";
import { type IdentifiableSchema } from "../capacities/identifiable";
import type { Timestamped } from "../capacities/timestamped";
import { Capable } from "@/capacities/capable";
import { JsonSerialisable } from "@/capacities/json-serialisable";
import { ProtobufEncodable } from "@/capacities/protobuf-encodable";
import { defineModel } from "./base";

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
 * UserModel — the classified constructor base, produced by the shared
 * {@link defineModel} base model.
 *
 * `defineModel` supplies the `assertClassify` constructor plus the runtime
 * `schemaName` (`"UserSchema"`) and `schema` (reflect object). It carries no
 * behaviour of its own, so the capacities can layer serialisation on top
 * without fighting an inherited constructor.
 */
const UserModel = defineModel<UserSchema>({
	schemaName: "UserSchema",
	schema: typia.reflect.schema<UserSchema>(),
	classify: (data) => typia.plain.assertClassify<UserSchema>(data),
});

/**
 * User capacities.
 *
 * `Capable` paves the registry; `JsonSerialisable` layers JSON (de)serialisation
 * — `toJSON` / `fromJSON` statics plus a JSON-override constructor — and
 * `ProtobufEncodable` layers protobuf (de)serialisation — `encode` / `decode`
 * statics plus a `message` schema string. Both are bound to the concrete
 * `UserSchema`.
 *
 * We intentionally do NOT apply the `Identifiable` / `Validatable` *mixins* here.
 * Their generated constructors expect a `(data, id)` two-arg shape and conflict
 * with `UserSchema` carrying `id` as a field (and with each other: `Validatable`
 * wraps the args array while `Identifiable` pops `id` from it). `UserSchema`
 * already extends the `IdentifiableSchema` / `Timestamped` *type* markers, and
 * all validation happens in `UserModel`'s `assertClassify`.
 */
const caps = ProtobufEncodable(
	JsonSerialisable(Capable(UserModel), {
		toJSON: typia.json.createAssertStringify<UserSchema>(),
		fromJSON: typia.json.createAssertParse<UserSchema>(),
	}),
	{
		encode: typia.protobuf.createAssertEncode<UserSchema>(),
		decode: typia.protobuf.createAssertDecode<UserSchema>(),
		message: typia.protobuf.message<UserSchema>(),
	},
);

class User extends caps {
	/** Construct (or parse-from-JSON) a validated `User`. */
	static from(data: Classifiable<UserSchema> | string): User {
		return new User(data as Classifiable<UserSchema>);
	}
}

export { type UserSchema, User };
