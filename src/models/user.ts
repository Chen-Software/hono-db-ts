import type { UUID } from "crypto";
import typia, { type tags, type Classifiable } from "typia";
import { Identifiable, type IdentifiableSchema } from "../capacities/identifiable";
import type { Timestamped } from "../capacities/timestamped";
import { type Versioned, versionedUpdate } from "../capacities/versioned";
import { isProd } from "@/macros";
import { Capable, type CapacityConstructor } from "@/capacities/capable";
import { Validatable } from "@/capacities/validatable";

/**
 * User schema
 * 
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

const classify = typia.plain.createAssertClassify<UserModel>();

class UserModel {
	constructor(data: Classifiable<UserSchema>) {
		return Object.assign(this, classify(data));
	}
}
/**
 * User capacities
 * 
 */
// const capacities = [Capable, Identifiable, Validatable];


const caps = Validatable<UserModel extends CapacityConstructor, UserSchema>(Identifiable(Capable(UserModel)), {
	assert: typia.createAssertEquals<UserSchema>(),
	assertGuard: typia.createAssertGuardEquals<UserSchema>(),
	validate: typia.createValidateEquals<UserSchema>(),
})

class User extends caps{
	constructor(props: Classifiable<UserSchema>) {
		super(props)
		Object.assign(this, classify(props));
	}

}

// /**
//  * User class
//  *
//  * - Static members mirror the `UserModel` API: `User.is`,
//  *   `User.equals`, `User.from`, `User.validate`,
//  *   `User.clone`, `User.toJSON`, `User.fromJSON`, `User.encode`, ...
//  * - `User.from` returns a `User` *instance* with bound methods
//  *   (`u.equals(other)`, `u.stringify()`, ...). Instance methods
//  *   are defined on the prototype and operate on the data copied onto `this`.
//  */
// class User implements UserSchema {
// 	id!: UUID;
// 	name!: string;
// 	email!: string;
// 	role!: "admin" | "member" | "viewer";
// 	age!: number;
// 	created_at!: string;

// 	/** Version timestamp — strictly increases on every update; equals `created_at` on the first version. This field IS the version. */
// 	updated_at!: string & tags.Format<"date-time">;

// 	private constructor(data: Classifiable<UserSchema>) {
// 		return Object.assign(this, typia.plain.assertClassify<UserSchema>(data));
// 	}

// 	// ---- static factory / creators ------------------------------------------
// 	static from(data: UserSchema): User {
// 		return new User(data);
// 	}

// 	// ---- instance methods (prototype) ---------------------------------------
// 	/** Structural equality against another user or user instance. */
// 	equals(other: UserSchema | User): boolean {
// 		return User.equals(this, other);
// 	}

// 	/** Whether this user is ordered after `than`. */
// 	more(than: UserSchema | User): boolean {
// 		return User.more(this, than);
// 	}

// 	/** Whether this user is ordered before `than`. */
// 	less(than: UserSchema | User): boolean {
// 		return User.less(this, than);
// 	}

// 	/** Assert this instance is a valid user (throws otherwise). */
// 	assert(): UserSchema {
// 		return User.assert(this);
// 	}

// 	/** Validate this instance, returning structured errors if any. */
// 	validate() {
// 		return User.validate(this);
// 	}

// 	/**
// 	 * Clone
// 	 */
// 	clone(): User {
// 		return User.from(this);
// 	}

// 	/**
// 	 * Immutable update. Returns a BRAND-NEW `User` instance carrying the same
// 	 * `id` and a *strictly later* `updated_at` (the version timestamp). The
// 	 * current instance is never mutated. `id` and `updated_at` are always
// 	 * authoritative — any `id` or `updated_at` present in `patch` is ignored in
// 	 * favour of the existing `id` and a freshly generated timestamp.
// 	 *
// 	 * Delegates to the shared `versionedUpdate` helper from the `Versioned`
// 	 * capacity so the versioning logic lives in exactly one place.
// 	 */
// 	update(patch: Partial<UserSchema>): User {
// 		return versionedUpdate(this, patch, User.from);
// 	}

// 	/** JSON string representation. */
// 	stringify(): string {
// 		return User.toJSON(this);
// 	}

// 	/** Raw data, so `JSON.stringify(u)` yields the user object. */
// 	toJSON(): UserSchema {
// 		return this;
// 	}

// 	/** Protobuf-encode this instance. */
// 	encode(): Uint8Array {
// 		return User.encode(this);
// 	}

// 	/** Protobuf-decode a fresh instance from this instance's encoding. */
// 	decode(): UserSchema {
// 		return User.decode(User.encode(this));
// 	}

// 	// ---- static functions ---------------------------------------------------
// 	static random = typia.createRandom<UserSchema>();
// 	static is = typia.createIs<UserSchema>();
// 	static equals = typia.compare.createEquals<UserSchema>();
// 	static less = (a: UserSchema, b: UserSchema): boolean =>
// 		typia.compare.less<UserSchema>(a, b);
// 	static more = (a: UserSchema, b: UserSchema): boolean =>
// 		typia.compare.less<UserSchema>(b, a);
// 	static assertStrict = typia.createAssertEquals<UserSchema>();
// 	static assert = typia.createAssert<UserSchema>();
// 	static validate = typia.createValidate<UserSchema>();
// 	static validateStrict = typia.createValidateEquals<UserSchema>();
// 	static validatePartial = typia.createValidate<Partial<UserSchema>>();
// 	static toJSON = typia.json.createAssertStringify<UserSchema>();
// 	static fromJSON = typia.json.createAssertParse<UserSchema>();
// 	static encode = typia.protobuf.createAssertEncode<UserSchema>();
// 	static decode = typia.protobuf.createAssertDecode<UserSchema>();
// 	static message = typia.protobuf.message<UserSchema>();
// 	static schema = typia.json.schema<[UserSchema]>();
// 	static metaSchema = !isProd ? typia.reflect.schema<UserSchema>() : undefined;
// }

export { type UserSchema, User , };
