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
 * - Static members mirror the `UserModel` API: `User.is`,
 *   `User.equals`, `User.from`, `User.validate`,
 *   `User.clone`, `User.toJSON`, `User.fromJSON`, `User.encode`, ...
 * - `User.from` returns a `User` *instance* with bound methods
 *   (`u.equals(other)`, `u.stringify()`, ...). Instance methods
 *   are defined on the prototype and operate on the data copied onto `this`.
 */
class User implements UserData {
	id!: UUID;
	name!: string & tags.MinLength<1> & tags.MaxLength<100>;
	email!: string & tags.Format<"email"> & tags.MaxLength<255>;
	role!: "admin" | "member" | "viewer";
	age!: number & tags.Type<"uint32"> & tags.ExclusiveMinimum<19> & tags.Maximum<100>;
	created_at!: string;

	private constructor(data: Classifiable<UserData>) {
		return Object.assign(this, typia.plain.assertClassify<UserData>(data));
	}

	// ---- static factory / creators ------------------------------------------
	static from(data: UserData): User {
		return new User(data);
	}

	static random(): UserData {
		return randomFn();
	}

	// ---- instance methods (prototype) ---------------------------------------
	/** Structural equality against another user or user instance. */
	equals(other: UserData | User): boolean {
		return User.equals(this, other);
	}

	/** Whether this user is ordered after `than`. */
	more(than: UserData | User): boolean {
		return User.more(this, than);
	}

	/** Whether this user is ordered before `than`. */
	less(than: UserData | User): boolean {
		return User.less(this, than);
	}

	/** Assert this instance is a valid user (throws otherwise). */
	assert(): UserData {
		return User.assert(this);
	}

	/** Validate this instance, returning structured errors if any. */
	validate() {
		return User.validate(this);
	}

	/** Clone this instance (deep copy, strips extras). */
	clone(): User {
		return User.from(cloneFn(this));
	}

	/** Prune this instance to the validated schema. */
	prune(): User {
		return User.from(pruneFn(this));
	}

	/** JSON string representation. */
	stringify(): string {
		return User.toJSON(this);
	}

	/** Raw data, so `JSON.stringify(u)` yields the user object. */
	toJSON(): UserData {
		return this;
	}

	/** Protobuf-encode this instance. */
	encode(): Uint8Array {
		return User.encode(this);
	}

	/** Protobuf-decode a fresh instance from this instance's encoding. */
	decode(): UserData {
		return User.decode(User.encode(this));
	}

	// ---- static functions ---------------------------------------------------
	static is = typia.createIs<UserData>();
	static equals = typia.compare.createEquals<UserData>();
	static less = (a: UserData, b: UserData): boolean =>
		typia.compare.less<UserData>(a, b);
	static more = (a: UserData, b: UserData): boolean =>
		typia.compare.less<UserData>(b, a);
	static assertStrict = typia.createAssertEquals<UserData>();
	static assert = typia.createAssert<UserData>();
	static validate = typia.createValidate<UserData>();
	static validateStrict = typia.createValidateEquals<UserData>();
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
