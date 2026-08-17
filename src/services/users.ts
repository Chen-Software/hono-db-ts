/**
 * users service — codeforge user resolution, profile reads, and the
 * session→user upsert.
 *
 * This module is the single owner of every `users`-table query, including the
 * session→user upsert (`ensureUser` / `resolveUser`). It used to live in
 * `src/auth/author.ts`; co-locating the SQL here means `src/auth/author.ts` is
 * now a zero-SQL facade that simply re-exports this service.
 *
 * REFERENCE IMPLEMENTATION — this service is written entirely with the Drizzle
 * query builder, using the table that the `SqlSerialisable` capacity derives
 * from the `User` model's reflected schema and registers in `tableRegistry`.
 * No raw `sql.unsafe` and no hand-written SQL strings: `db.select()` /
 * `db.insert()` / `db.update()` bind every value through Drizzle.
 */
import { desc, eq } from 'drizzle-orm'
import { resolveTableThunk } from '@/capacities/sql-serialisable'
import type { Db } from './types'
import { listByOwner } from './repository'

// Drizzle table derived by `SqlSerialisable` and registered under the model
// name. Cast to `any` so we can use the column references (e.g. `users.id`)
// without fighting the untyped `Table` — the service layer is intentionally
// loosely typed, and the real gate is the Vite build.
const users = resolveTableThunk('UserSchema', 'sqlite')() as any

/** The Better Auth session shape used to resolve (or upsert) a user. */
export type ForumSession = {
	user?: { id?: string; name?: string; email?: string };
} | null

export type UserRow = {
	id: string
	name: string
	email?: string
	role?: string
	age?: number
	created_at?: string
}

/** One user by id, or null. */
export async function getById(db: Db, id: string): Promise<UserRow | null> {
	const rows = await db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			role: users.role,
			age: users.age,
			created_at: users.created_at,
		})
		.from(users)
		.where(eq(users.id, id))
		.limit(1)
	return (rows[0] ?? null) as UserRow | null
}

/** Recent users (moderator picker). */
export async function listRecent(db: Db, limit = 50) {
	return db
		.select({ id: users.id, name: users.name, email: users.email })
		.from(users)
		.orderBy(desc(users.created_at))
		.limit(limit)
}

/** Recent user ids + names (author picker). */
export async function listAuthors(db: Db, limit = 20) {
	return db
		.select({ id: users.id, name: users.name })
		.from(users)
		.orderBy(desc(users.created_at))
		.limit(limit)
}

/**
 * Full profile page payload — the user row plus the repositories they own.
 */
export async function getProfile(db: Db, id: string) {
	const user = await getById(db, id)
	const repositories = user ? await listByOwner(db, id) : []
	return { user, repositories }
}

/**
 * Ensure a `users` row exists for the authenticated Better Auth user and return
 * its id. Uses the Better Auth `user.id` as the `users.id` so the profile page
 * (`/users/:id`) and the repo queries (`WHERE "ownerId" = ?`) line up with
 * the signed-in account.
 *
 * The `users` table requires `name`, `email`, `role` and `age > 19`, so we seed
 * those from the session when upserting a brand-new row. Returns `null` only
 * when there is no session and no seeded user to fall back to.
 */
export async function ensureUser(
	db: Db,
	session: ForumSession,
): Promise<string | null> {
	const sessionId = session?.user?.id
	if (sessionId) {
		const hit = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, sessionId))
			.limit(1)
		if (hit[0]?.id) return hit[0].id

		// First request by this account — create the profile row. The Better
		// Auth user may lack name/email, so fall back to safe defaults.
		const name = session?.user?.name?.trim() || 'Member'
		const email =
			session?.user?.email?.trim() ||
			`${sessionId.toLowerCase()}@codeforge.local`
		const now = new Date().toISOString()
		try {
			await db.insert(users).values({
				id: sessionId,
				created_at: now,
				name,
				email,
				role: 'member',
				age: 20,
			})
			return sessionId
		} catch (err) {
			// If the upsert races or the row already exists, fall through to the
			// read below (or the seeded fallback) rather than dropping the row.
			console.error('[users.ensureUser] upsert failed:', err)
		}

		const retry = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, sessionId))
			.limit(1)
		if (retry[0]?.id) return retry[0].id
	}
	return resolveUser(db, session)
}

/**
 * Read-side of the session→user mapping: returns the session user's id when
 * such a row exists, otherwise falls back to a seeded default (only used for
 * anonymous/legacy paths).
 */
export async function resolveUser(
	db: Db,
	session: ForumSession,
): Promise<string | null> {
	const sessionId = session?.user?.id
	if (sessionId) {
		const hit = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, sessionId))
			.limit(1)
		if (hit[0]?.id) return hit[0].id
	}
	const fallback = await db
		.select({ id: users.id })
		.from(users)
		.orderBy(users.created_at)
		.limit(1)
	return (fallback[0]?.id as string) ?? null
}
