import type { UUID } from "crypto";
import typia, { type tags } from "typia";
import type { Identifiable } from "../capacities/identifiable";
import type { Timestamped } from "../capacities/timestamped";
import { isProd } from "@/macros";

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

const _constructor = typia.plain.createAssertClassify<User>();
const _randomSeeder = typia.createRandom<User>();
const _equals = typia.compare.createEquals<User>();
const _less = typia.compare.createLess<User>();
const UserModel = {
	new: _constructor,
	from: _constructor,
	newRandom: _randomSeeder,
	fromRandom: _randomSeeder,
	is: typia.createIs<User>(),
	equals: _equals,
	less: _less,
	more: (x: User, y: User) => _less(y, x),
	assertEquals: typia.createAssertEquals<User>(),
	assert: typia.createAssert<User>(),
	validate: typia.createValidate<User>(),
	validateEquals: typia.createValidateEquals<User>(),
	validatePartial: typia.createValidate<Partial<User>>(),
	clone: typia.plain.createAssertClone<User>(),
	prune: typia.plain.createAssertPrune<User>(),
	toJSON: typia.json.createAssertStringify<User>(),
	fromJSON: typia.json.createAssertParse<User>(),
	encode: typia.protobuf.createAssertEncode<User>(),
	decode: typia.protobuf.createAssertDecode<User>(),
	message: typia.protobuf.message<User>(),
	schema: typia.json.schema<[User]>(),
	...(!isProd && { metaSchema: typia.reflect.schema<User>() }),
};

export { type User, UserModel };
