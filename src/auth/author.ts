/**
 * author — resolve a forum user id that is valid against the app `users` table.
 *
 * Better Auth keeps its own users in a separate adapter table, independent of
 * the forum's seeded `users` model. So the authenticated session's `user.id`
 * does NOT automatically exist in `users`. Rather than attributing posts to a
 * random seeded user (which makes the author's own profile show 0 activity),
 * `ensureForumUser` upserts a `users` row keyed by the Better Auth id, so the
 * session user owns their threads/boards and their profile reflects them.
 *
 * `resolveForumUser` is the read-side of the same idea: it returns the session
 * user's forum id when such a row exists, otherwise falls back to a seeded
 * default (only used for anonymous/legacy paths).
 */
export type ForumSession = {
	user?: { id?: string; name?: string; email?: string };
} | null;

export type SqlLike = { unsafe: (query: string, params?: unknown[]) => Promise<unknown> };

/**
 * Ensure a `users` row exists for the authenticated Better Auth user and return
 * its id. Uses the Better Auth `user.id` as the `users.id` so the profile page
 * (`/users/:id`) and the activity queries (`WHERE authorId = ?`) line up with
 * the signed-in account.
 *
 * The `users` table (generated from `UserSchema`) requires `name`, `email`,
 * `role` and `age > 19`, so we seed those from the session when upserting a
 * brand-new row. Returns `null` only when there is no session and no seeded
 * user to fall back to.
 */
export async function ensureForumUser(
	sql: SqlLike,
	session: ForumSession,
): Promise<string | null> {
	const sessionId = session?.user?.id;
	if (sessionId) {
		const hit = (await sql.unsafe(
			`SELECT "id" FROM "users" WHERE "id" = ? LIMIT 1`,
			[sessionId],
		)) as Array<{ id: string }>;
		if (hit[0]?.id) return hit[0].id;

		// First post by this account — create the forum profile row. The Better
		// Auth user may lack name/email, so fall back to safe defaults.
		const name = session?.user?.name?.trim() || "Member";
		const email =
			session?.user?.email?.trim() ||
			`${sessionId.toLowerCase()}@bbs.local`;
		const now = new Date().toISOString();
		try {
			await sql.unsafe(
				`INSERT INTO "users" ("id","created_at","name","email","role","age","post_count","thread_count","reply_count","all_activities")
				 VALUES (?,?,?,?,?,?,?,?,?,?)`,
				[sessionId, now, name, email, "member", 20, 0, 0, 0, 0],
			);
			return sessionId;
		} catch (err) {
			// If the upsert races or the row already exists, fall through to the
			// read below (or the seeded fallback) rather than dropping the post.
			console.error("[ensureForumUser] upsert failed:", err);
		}

		const retry = (await sql.unsafe(
			`SELECT "id" FROM "users" WHERE "id" = ? LIMIT 1`,
			[sessionId],
		)) as Array<{ id: string }>;
		if (retry[0]?.id) return retry[0].id;
	}
	return resolveForumUser(sql, session);
}

export async function resolveForumUser(
	sql: SqlLike,
	session: ForumSession,
): Promise<string | null> {
	const sessionId = session?.user?.id;
	if (sessionId) {
		const hit = (await sql.unsafe(
			`SELECT "id" FROM "users" WHERE "id" = ? LIMIT 1`,
			[sessionId],
		)) as Array<{ id: string }>;
		if (hit[0]?.id) return hit[0].id;
	}
	const fallback = (await sql.unsafe(
		`SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1`,
	)) as Array<{ id: string }>;
	return fallback[0]?.id ?? null;
}
