/**
 * home service — the forum landing page payload (stats + recent boards /
 * threads / posts / hot + the board picker for the "new thread" form).
 */
import type { Db } from './types'
import { all } from './types'
import { PAGE } from './constants'

export interface HomePage {
	stats: any
	boards: any[]
	threads: any[]
	posts: any[]
	hot: any[]
	allBoards: any[]
}

export async function getHome(db: Db): Promise<HomePage> {
	const stats = (
		await all(
			db,
			`SELECT (SELECT COUNT(*) FROM "users") AS users,
			        (SELECT COUNT(*) FROM "boards") AS boards,
			        (SELECT COUNT(*) FROM "threads") AS threads,
			        (SELECT COUNT(*) FROM "replies") AS replies,
			        (SELECT COUNT(*) FROM "posts") AS posts`,
		)
	)[0] ?? null

	const boards = await all(
		db,
		`SELECT b.id, b.name, b.slug, b.description,
		        u.name AS moderator_name,
		        (SELECT COUNT(*) FROM "threads" t WHERE t."boardId" = b.id) AS thread_count
		 FROM "boards" b
		 LEFT JOIN "users" u ON u.id = b."moderatorId"
		 ORDER BY thread_count DESC
		 LIMIT ${PAGE.homeBoards}`,
	)

	const threads = await all(
		db,
		`SELECT t.id, t.title, t.pinned, t.locked, t."updated_at",
		        u.name AS author_name,
		        b.name AS board_name,
		        (SELECT COUNT(*) FROM "replies" r WHERE r."threadId" = t.id) AS reply_count
		 FROM "threads" t
		 LEFT JOIN "users" u ON u.id = t."authorId"
		 LEFT JOIN "boards" b ON b.id = t."boardId"
		 ORDER BY t.pinned DESC, t."updated_at" DESC
		 LIMIT ${PAGE.homeThreads}`,
	)

	const posts = await all(
		db,
		`SELECT p.id, p.title, p."updated_at", u.name AS author_name
		 FROM "posts" p
		 LEFT JOIN "users" u ON u.id = p."authorId"
		 WHERE p.published = 1
		 ORDER BY p."updated_at" DESC
		 LIMIT ${PAGE.homePosts}`,
	)

	const hot = await all(
		db,
		`SELECT t.id, t.title, t.pinned, t.locked, t."updated_at",
		        COUNT(r.id) AS reply_count
		 FROM "threads" t
		 LEFT JOIN "replies" r ON r."threadId" = t.id
		 GROUP BY t.id
		 ORDER BY reply_count DESC, t."updated_at" DESC
		 LIMIT ${PAGE.homeHot}`,
	)

	const allBoards = await all(db, `SELECT id, name FROM "boards" ORDER BY "created_at" DESC LIMIT ${PAGE.allBoards}`)

	return { stats, boards, threads, posts, hot, allBoards }
}

/** Site-wide counts (the `/stats` read model). */
export async function getStats(db: Db): Promise<any> {
	return (
		await all(
			db,
			`SELECT (SELECT COUNT(*) FROM "users") AS users,
			        (SELECT COUNT(*) FROM "boards") AS boards,
			        (SELECT COUNT(*) FROM "threads") AS threads,
			        (SELECT COUNT(*) FROM "replies") AS replies,
			        (SELECT COUNT(*) FROM "posts") AS posts`,
		)
	)[0] ?? null
}
