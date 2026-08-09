import type { UUID } from "crypto";
import typia, { type tags, type Classifiable } from "typia";
import type { Identifiable } from "../capacities/identifiable";
import type { Timestamped } from "../capacities/timestamped";
import { isProd } from "@/macros";

/**
 * User data model
 */
interface UserData extends Identifiable<UUID>, Timestamped {
	/** Name of the user. */
	name: string & tags.MinLength<1> & tags.MaxLength<100>;

	/** Email address of the user. */
	email: string & tags.Format<"email"> & tags.MaxLength<255>;

	/** User role for permission and access control. */
	role: "admin" | "member" | "viewer";

	/** Age of the user. */
	age: number & tags.Type<"uint32"> & tags.ExclusiveMinimum<19> & tags.Maximum<100>;
}

// static reusable functions
const randomFn = typia.createRandom<UserData>();
const cloneFn = typia.plain.createAssertClone<UserData>();
const pruneFn = typia.plain.createAssertPrune<UserData>();

/**
 * User class
 *
 * - Static members `UserModel` API: `User.is`,
 *   `User.equals`, `User.new`, `User.from`, `User.newRandom`, `User.validate`,
 *   `User.clone`, `User.toJSON`, `User.fromJSON`, `User.encode`, ...
 * - `User.new` / `User.from` return a `User` *instance* with bound methods
 *   (`u.is(User)`, `u.equals(other)`, `u.stringify()`, ...).
 */
class User implements UserData {
	id!: UUID;
	name!: string & tags.MinLength<1> & tags.MaxLength<100>;
	email!: string & tags.Format<"email"> & tags.MaxLength<255>;
	role!: "admin" | "member" | "viewer";
	age!: number & tags.Type<"uint32"> & tags.ExclusiveMinimum<19> & tags.Maximum<100>;
	created_at!: string;
	updated_at!: string;

	// ---- instance methods (bound in the constructor) ------------------------
	is!: (model: typeof User) => boolean;
	equals!: (other: UserData | User) => boolean;
	less!: (than: UserData | User) => boolean;
	more!: (than: UserData | User) => boolean;
	assertEquals!: (other: UserData | User) => UserData;
	assert!: () => UserData;
	validate!: () => ReturnType<typeof User.validate>;
	clone!: () => User;
	prune!: () => User;
	/** JSON string representation (use `JSON.stringify(u)` for the object). */
	stringify!: () => string;
	/** Raw data, so `JSON.stringify(u)` yields the user object. */
	toJSON!: () => UserData;
	encode!: () => Uint8Array;
	decode!: () => UserData;

	private constructor(data: Classifiable<UserData>) {
		const classified = typia.plain.assertClassify<UserData>(data);
		Object.assign(this, classified);
		this.is = () => User.is(classified);
		this.equals = (other) => User.equals(classified, other);
		this.less = (than) => User.less(classified, than);
		this.more = (than) => User.more(classified, than);
		this.assertEquals = (other) => User.assertEquals(other);
		this.assert = () => User.assert(classified);
		this.validate = () => User.validate(classified);
		this.clone = () => User.from(cloneFn(classified));
		this.prune = () => User.from(pruneFn(classified));
		this.stringify = () => User.toJSON(classified);
		this.toJSON = () => classified;
		this.encode = () => User.encode(classified);
		this.decode = () => User.decode(User.encode(classified));
	}

	// ---- static factory / creators ------------------------------------------
	static new(data: UserData): User {
		return new User(data);
	}

	static from(data: UserData): User {
		return new User(data);
	}

	static random(): UserData {
		return randomFn();
	}

	static newRandom = User.random;

	static fromRandom = User.random;

	// ---- static functions -------------
	static is = typia.createIs<UserData>();
	static equals = typia.compare.createEquals<UserData>();
	static less = (x: UserData, y: UserData) => typia.compare.less<UserData>(x, y);
	static more = (x: UserData, y: UserData) => typia.compare.less<UserData>(y, x);
	static assertEquals = typia.createAssertEquals<UserData>();
	static assert = typia.createAssert<UserData>();
	static validate = typia.createValidate<UserData>();
	static validateEquals = typia.createValidateEquals<UserData>();
	static validatePartial = typia.createValidate<Partial<UserData>>();
	static clone = typia.plain.createAssertClone<UserData>();
	static prune = typia.plain.createAssertPrune<UserData>();
	static toJSON = typia.json.createAssertStringify<UserData>();
	static fromJSON = typia.json.createAssertParse<UserData>();
	static encode = typia.protobuf.createAssertEncode<UserData>();
	static decode = typia.protobuf.createAssertDecode<UserData>();
	static message = typia.protobuf.message<UserData>();
	static schema = typia.json.schema<[UserData]>();
	static metaSchema = !isProd ? typia.reflect.schema<UserData>() : undefined;
}

export { type UserData, User };
export { User as UserModel };
