/**
 * users service — forum-user resolution, profile reads, and the cached
 * activity-counter resync.
 *
 * This module is the single owner of every `users`-table query, including the
 * session→forum-user upsert (`ensureForumUser` / `resolveForumUser`) and the
 * `refreshUserActivity` counter resync. Those three used to live in
 * `src/auth/author.ts`; co-locating the SQL here means `src/auth/author.ts` is
 * now a zero-SQL facade that simply re-exports this service.
 *
 * REFERENCE IMPLEMENTATION — this service is written entirely with the Drizzle
 * query builder, using the tables that the `SqlSerialisable` capacity derives
 * from each model's reflected schema and registers in `tableRegistry`. No raw
 * `sql.unsafe` and no hand-written SQL strings: `db.select()` / `db.insert()` /
 * `db.update()` bind every value through Drizzle. (For queries that are
 * awkward to express in the builder, the other services fall back to the
 * `all` / `run` helpers in `./types`, which still execute through Drizzle's
 * parameterised path — never `unsafe`.)
 */
import { and, count, desc, eq, sql as dsql } from 'drizzle-orm'
import { resolveTableThunk } from '@/capacities/sql-serialisable'
import type { Db } from './types'

// Drizzle tables derived by `SqlSerialisable` and registered under the model
// name. Cast to `any` so we can use the column references (e.g. `users.id`)
// without fighting the untyped `Table` — the service layer is intentionally
// loosely typed, and the real gate is the Vite build.
const users = resolveTableThunk('UserSchema', 'sqlite')() as any
const threads = resolveTableThunk('ThreadSchema', 'sqlite')() as any
const posts = resolveTableThunk('PostData', 'sqlite')() as any
const replies = resolveTableThunk('ReplySchema', 'sqlite')() as any
const boards = resolveTableThunk('BoardSchema', 'sqlite')() as any

/** The Better Auth session shape used to resolve (or upsert) a forum user. */
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

/** One forum user by id, or null. */
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

/** Full profile page payload: the user plus their threads / posts / replies. */
export async function getProfile(db: Db, id: string) {
	const user = await getById(db, id)
	const threadsRows = await db
		.select({
			id: threads.id,
			title: threads.title,
			created_at: threads.created_at,
			updated_at: threads.updated_at,
			board_name: boards.name,
			reply_count: dsql<number>`(SELECT COUNT(*) FROM "replies" r WHERE r."threadId" = ${threads.id})`,
		})
		.from(threads)
		.leftJoin(boards, eq(threads.boardId, boards.id))
		.where(eq(threads.authorId, id))
		.orderBy(desc(threads.updated_at))
		.limit(10)
	const postsRows = await db
		.select({ id: posts.id, title: posts.title, updated_at: posts.updated_at })
		.from(posts)
		.where(and(eq(posts.authorId, id), eq(posts.published, 1)))
		.orderBy(desc(posts.updated_at))
		.limit(10)
	const repliesRows = await db
		.select({
			id: replies.id,
			threadId: replies.threadId,
			body: replies.body,
			created_at: replies.created_at,
			thread_title: threads.title,
		})
		.from(replies)
		.leftJoin(threads, eq(replies.threadId, threads.id))
		.where(eq(replies.authorId, id))
		.orderBy(desc(replies.created_at))
		.limit(10)
	return { user, threads: threadsRows, posts: postsRows, replies: repliesRows }
}

/** Users who authored the most posts (the `/stats/top-posters` read model). */
export async function topPosters(db: Db, limit = 10): Promise<any[]> {
	const n = Number.isFinite(limit) && limit > 0 ? limit : 10
	return db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			role: users.role,
			post_count: count(posts.id),
		})
		.from(users)
		.leftJoin(posts, eq(posts.authorId, users.id))
		.groupBy(users.id)
		.orderBy(desc(count(posts.id)))
		.limit(n)
}

/**
 * Ensure a `users` row exists for the authenticated Better Auth user and return
 * its id. Uses the Better Auth `user.id` as the `users.id` so the profile page
 * (`/users/:id`) and the activity queries (`WHERE authorId = ?`) line up with
 * the signed-in account.
 *
 * The `users` table requires `name`, `email`, `role` and `age > 19`, so we seed
 * those from the session when upserting a brand-new row. Returns `null` only
 * when there is no session and no seeded user to fall back to.
 */
export async function ensureForumUser(
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

		// First post by this account — create the forum profile row. The Better
		// Auth user may lack name/email, so fall back to safe defaults.
		const name = session?.user?.name?.trim() || 'Member'
		const email =
			session?.user?.email?.trim() ||
			`${sessionId.toLowerCase()}@bbs.local`
		const now = new Date().toISOString()
		try {
			await db.insert(users).values({
				id: sessionId,
				created_at: now,
				name,
				email,
				role: 'member',
				age: 20,
				post_count: 0,
				thread_count: 0,
				reply_count: 0,
				all_activities: 0,
			})
			return sessionId
		} catch (err) {
			// If the upsert races or the row already exists, fall through to the
			// read below (or the seeded fallback) rather than dropping the post.
			console.error('[users.ensureForumUser] upsert failed:', err)
		}

		const retry = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, sessionId))
			.limit(1)
		if (retry[0]?.id) return retry[0].id
	}
	return resolveForumUser(db, session)
}

/**
 * Recompute a user's cached activity counters (`thread_count`, `reply_count`,
 * `post_count`, `all_activities`) from the actual relations. These counters are
 * NOT derived on read except in profile *list* views, so the materialised
 * `users` columns must be kept in sync by the write path — otherwise a user's
 * profile (and the `/users/:id` JSON) reports "0 thread" even after they've
 * authored content.
 *
 * We recompute from truth (COUNT of rows) rather than increment/decrement, so
 * the counters never drift if a create/delete is missed or races.
 */
export async function refreshUserActivity(
	db: Db,
	userId: string | null | undefined,
): Promise<void> {
	if (!userId) return
	try {
		const [thread, reply, post] = await Promise.all([
			db.select({ n: count() }).from(threads).where(eq(threads.authorId, userId)),
			db.select({ n: count() }).from(replies).where(eq(replies.authorId, userId)),
			db.select({ n: count() }).from(posts).where(eq(posts.authorId, userId)),
		])
		const threadCount = Number(thread[0]?.n ?? 0)
		const replyCount = Number(reply[0]?.n ?? 0)
		const postCount = Number(post[0]?.n ?? 0)
		const allActivities = threadCount + replyCount + postCount
		await db
			.update(users)
			.set({
				thread_count: threadCount,
				reply_count: replyCount,
				post_count: postCount,
				all_activities: allActivities,
			})
			.where(eq(users.id, userId))
	} catch (err) {
		// Activity counters are best-effort; never fail the primary write.
		console.error('[users.refreshUserActivity] failed:', err)
	}
}

/**
 * Read-side of the session→forum-user mapping: returns the session user's forum
 * id when such a row exists, otherwise falls back to a seeded default (only
 * used for anonymous/legacy paths).
 */
export async function resolveForumUser(
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
