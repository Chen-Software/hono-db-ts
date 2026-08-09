import type { UUID } from "crypto";
import typia, { type tags, type Classifiable } from "typia";
import type { Identifiable } from "../capacities/identifiable";
import type { Timestamped } from "../capacities/timestamped";
import { type Versioned, versionedUpdate } from "../capacities/versioned";
import { isProd } from "@/macros";

/**
 * User data model
 */
interface UserData extends Identifiable<UUID>, Timestamped, Versioned {
	/** Name of the user. */
	name: string & tags.MinLength<1> & tags.MaxLength<100>;

	/** Email address of the user. */
	email: string & tags.Format<"email"> & tags.MaxLength<255>;

	/** User role for permission and access control. */
	role: "admin" | "member" | "viewer";

	/** Age of the user. */
	age: number & tags.Type<"uint32"> & tags.ExclusiveMinimum<19> & tags.Maximum<100>;
}

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
	name!: string;
	email!: string;
	role!: "admin" | "member" | "viewer";
	age!: number;
	created_at!: string;

	/** Version timestamp — strictly increases on every update; equals `created_at` on the first version. This field IS the version. */
	updated_at!: string & tags.Format<"date-time">;

	private constructor(data: Classifiable<UserData>) {
		return Object.assign(this, typia.plain.assertClassify<UserData>(data));
	}

	// ---- static factory / creators ------------------------------------------
	static from(data: UserData): User {
		return new User(data);
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

	/** 
	 * Clone
	 */
	clone(): User {
		return User.from(this);
	}

	/**
	 * Immutable update. Returns a BRAND-NEW `User` instance carrying the same
	 * `id` and a *strictly later* `updated_at` (the version timestamp). The
	 * current instance is never mutated. `id` and `updated_at` are always
	 * authoritative — any `id` or `updated_at` present in `patch` is ignored in
	 * favour of the existing `id` and a freshly generated timestamp.
	 *
	 * Delegates to the shared `versionedUpdate` helper from the `Versioned`
	 * capacity so the versioning logic lives in exactly one place.
	 */
	update(patch: Partial<UserData>): User {
		return versionedUpdate(this, patch, User.from);
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
	static random = typia.createRandom<UserData>();
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
