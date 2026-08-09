import type { UUID } from "crypto";
import typia, { type tags } from "typia";
import type { Identifiable } from "../capacities/identifiable";
import type { Timestamped } from "../capacities/timestamped";

interface User extends Identifiable<UUID>, Timestamped {
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

const UserModel = {
	is: typia.createIs<User>(),
	equals: typia.createAssertEquals<User>(),
	assert: typia.createAssert<User>(),
	validate: typia.createValidate<User>(),
	validatePartial: typia.createValidate<Partial<User>>(),
	toJSON: typia.json.createAssertStringify<User>(),
	fromJSON: typia.json.createAssertParse<User>(),
	encode: typia.protobuf.createAssertEncode<User>(),
	decode: typia.protobuf.createAssertDecode<User>(),
	message: typia.protobuf.message<User>(),
	schema: typia.json.schema<[User]>(),
	new: typia.plain.createAssertClassify<User>(),
	from: typia.plain.createAssertClassify<User>(),
};

export { type User, UserModel };
