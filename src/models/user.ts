import typia, { tags } from "typia";
import type { UUID } from "crypto";
import { type Identifiable } from "../capacities/identifiable";

export const validateMember = typia.createValidate<User>();

interface User extends Identifiable<UUID> {
	email: string & tags.Format<"email">;
	age: number &
		tags.Type<"uint32"> &
		tags.ExclusiveMinimum<19> &
		tags.Maximum<100>;
}

const UserModel = {
	is: typia.createIs<User>(),
	equals: typia.createValidateEquals<User>(),
	assert: typia.createAssert<User>(),
	assertEquals: typia.createAssertEquals<User>(),
	validates: typia.createValidate<User>(),
};

export { type User, UserModel };
