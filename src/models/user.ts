import type { UUID } from "crypto";
import typia, { type tags } from "typia";
import type { Identifiable } from "../capacities/identifiable";
import { createInstance, type Instantiable } from "@/capacities/instantiable";

interface User extends Identifiable<UUID>, Instantiable<User> {
	name: string & tags.MinLength<1> & tags.MaxLength<100>;
	email: string & tags.Format<"email"> & tags.MaxLength<255>;
	role: "admin" | "member" | "viewer";
	created_at: string & tags.Format<"date-time">;
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
	new: (...args: any[]) => createInstance(args),
	from: (seed: Instantiable<User>) => createInstance(seed),
};

export { type User, UserModel };
