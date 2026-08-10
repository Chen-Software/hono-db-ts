import type { User, UserSchema } from "../models/user";

/** The user role vocabulary (surfaced on the port, not as raw filter SQL). */
export type UserRole = "admin" | "member" | "viewer";

/**
 * `UserRepository` — the application-owned PORT for user persistence.
 *
 * Same rationale as `PostRepository`: `UserService` depends on this interface
 * and knows nothing about SQL, object stores, or the filesystem. The concrete
 * `UserRepo` adapter implements it over whatever backend the composition root
 * chooses (bun:sqlite, Postgres, S3-shaped blob, …).
 */
export interface UserRepository {
	/** Insert (or upsert) a user; assigns `id` / `created_at` when absent. */
	insert(data: Partial<UserSchema>): Promise<User>;

	/** Load a user by id, or `undefined` if absent. */
	load(id: string): Promise<User | undefined>;

	/** All users. */
	list(): Promise<User[]>;

	/** Users with the given role. */
	listByRole(role: UserRole): Promise<User[]>;

	/** Delete a user by id (no-op if absent). */
	delete(id: string): Promise<void>;
}
