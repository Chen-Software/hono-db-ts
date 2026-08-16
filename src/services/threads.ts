/**
 * threads service — thread index, thread detail page, thread edit page, and
 * the thread/reply mutations. All SQL is `?`-parameterized.
 */
import type { Db } from './types'
import { all, run } from './types'
import { PAGE } from './constants'

export interface ThreadIndexPage {
	threads: any[]
	boards: any[]
	total: number
	nextCursor: string | null
}

export async function listIndex(
	db: Db,
	opts: { boardFilter?: string; lockedFilter?: string; cursor?: string },
): Promise<ThreadIndexPage> {
	const where: string[] = []
	const params: unknown[] = []
	if (opts.boardFilter) {
		where.push(`t."boardId" = ?`)
		params.push(opts.boardFilter)
	}
	if (opts.lockedFilter === '1') where.push(`t."locked" = 1`)
	else if (opts.lockedFilter === '0') where.push(`t."locked" = 0`)
	if (opts.cursor) {
		where.push(`t."updated_at" < ?`)
		params.push(opts.cursor)
	}
	const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

	const total = (await all<{ n: number }>(db, `SELECT COUNT(*) AS n FROM "threads" t ${whereSql}`, params))[0]?.n ?? 0

	const threads = await all(
		db,
		`SELECT t.id, t.title, t.pinned, t.locked, t."created_at", t."updated_at",
		        u.name AS author_name,
		        b.name AS board_name,
		        (SELECT COUNT(*) FROM "replies" r WHERE r."threadId" = t.id) AS reply_count
		 FROM "threads" t
		 LEFT JOIN "users" u ON u.id = t."authorId"
		 LEFT JOIN "boards" b ON b.id = t."boardId"
		 ${whereSql}
		 ORDER BY t.pinned DESC, t."updated_at" DESC
		 LIMIT ${PAGE.threadsIndex}`,
		params,
	)

	const boards = await all(db, `SELECT id, name FROM "boards" ORDER BY "created_at" DESC LIMIT 50`)

	const last: any = threads[threads.length - 1]
	const nextCursor = threads.length === PAGE.threadsIndex && last ? last.updated_at : null
	return { threads, boards, total, nextCursor }
}

export interface ThreadPage {
	thread: any
	boards: any[]
	replies: any[]
	hot: any[]
	authors: any[]
}

export async function getPage(db: Db, uuid: string): Promise<ThreadPage> {
	const threadRows = await all(
		db,
		`SELECT t.id, t.title, t.pinned, t.locked, t."boardId", t."created_at", t."updated_at",
		        u.name AS author_name,
		        b.name AS board_name, b.slug AS board_slug
		 FROM "threads" t
		 LEFT JOIN "users" u ON u.id = t."authorId"
		 LEFT JOIN "boards" b ON b.id = t."boardId"
		 WHERE t.id = ?
		 LIMIT 1`,
		[uuid],
	)
	const thread = threadRows[0] ?? null

	const boards = await all(db, `SELECT id, name FROM "boards" ORDER BY "created_at" DESC LIMIT 50`)
	const replies = await all(
		db,
		`SELECT r.id, r."authorId" AS authorId, r."parentId", r.body, r."created_at", u.name AS author_name
		 FROM "replies" r
		 LEFT JOIN "users" u ON u.id = r."authorId"
		 WHERE r."threadId" = ?
		 ORDER BY r."created_at" ASC, r.id ASC`,
		[uuid],
	)
	const hot = await all(
		db,
		`SELECT t.id, t.title, COUNT(r.id) AS reply_count
		 FROM "threads" t
		 LEFT JOIN "replies" r ON r."threadId" = t.id
		 GROUP BY t.id
		 ORDER BY reply_count DESC, t."updated_at" DESC
		 LIMIT 6`,
	)
	const authors = await all(db, `SELECT id, name FROM "users" ORDER BY "created_at" DESC LIMIT 20`)

	return { thread, boards, replies, hot, authors }
}

/** Thread by id with author + board + replyCount ({ ...thread, author, board, replyCount }). */
export async function getWithRelations(db: Db, id: string): Promise<any> {
	const thread = (await all(db, `SELECT * FROM "threads" WHERE "id" = ? LIMIT 1`, [id]))[0]
	if (!thread) return null
	const author = (await all(db, `SELECT id, name, email FROM "users" WHERE "id" = ?`, [thread.authorId]))[0] ?? null
	const board = (await all(db, `SELECT id, name, slug FROM "boards" WHERE "id" = ?`, [thread.boardId]))[0] ?? null
	const replyCount = (await all<{ n: number }>(db, `SELECT COUNT(*) AS n FROM "replies" WHERE "threadId" = ?`, [id]))[0].n
	return { ...thread, author, board, replyCount }
}

/** Replies within a thread (oldest-first, keyset `cursor`). */
export async function listReplies(
	db: Db,
	id: string,
	opts: { cursor?: string; limit?: number } = {},
): Promise<{ rows: any[]; nextCursor: string | null }> {
	const conds = ['r."threadId" = ?']
	const params: unknown[] = [id]
	if (opts.cursor) {
		conds.push(`r."created_at" > ?`)
		params.push(opts.cursor)
	}
	const limit = opts.limit ?? 50
	const rows = await all(
		db,
		`SELECT r.id, r."threadId", r."authorId", r."parentId", r.body, r."created_at",
		        u.name AS author_name
		 FROM "replies" r LEFT JOIN "users" u ON u.id = r."authorId"
		 WHERE ${conds.join(' AND ')} ORDER BY r."created_at" ASC LIMIT ${limit}`,
		params,
	)
	const last: any = rows[rows.length - 1]
	const nextCursor = rows.length === limit && last ? last.created_at : null
	return { rows, nextCursor }
}

export async function getEdit(db: Db, uuid: string): Promise<{ thread: any; boards: any[]; boardName: string }> {
	const threadRows = await all(db, `SELECT id, title, pinned, locked, "boardId", "authorId" FROM "threads" WHERE "id" = ? LIMIT 1`, [uuid])
	const thread = threadRows[0] ?? null
	const boards = await all(db, `SELECT id, name FROM "boards" ORDER BY "created_at" DESC LIMIT 50`)
	let boardName = ''
	if (thread) {
		const b = await all<{ name: string }>(db, `SELECT name FROM "boards" WHERE "id" = ? LIMIT 1`, [thread.boardId])
		boardName = b[0]?.name ?? ''
	}
	return { thread, boards, boardName }
}

export async function create(db: Db, input: { title: string; boardId: string; authorId: string }): Promise<string> {
	const id = crypto.randomUUID()
	const now = new Date().toISOString()
	await run(
		db,
		`INSERT INTO "threads" ("id","created_at","updated_at","boardId","authorId","title","pinned","locked") VALUES (?,?,?,?,?,?,0,0)`,
		[id, now, now, input.boardId, input.authorId, input.title],
	)
	return id
}

export async function update(
	db: Db,
	id: string,
	patch: { title: string; boardId: string; pinned: number; locked: number },
): Promise<void> {
	await run(
		db,
		`UPDATE "threads" SET "title" = ?, "boardId" = ?, "pinned" = ?, "locked" = ?, "updated_at" = ? WHERE "id" = ?`,
		[patch.title, patch.boardId, patch.pinned, patch.locked, new Date().toISOString(), id],
	)
}

export async function togglePin(db: Db, id: string): Promise<void> {
	await run(
		db,
		`UPDATE "threads" SET "pinned" = CASE "pinned" WHEN 1 THEN 0 ELSE 1 END, "updated_at" = ? WHERE "id" = ?`,
		[new Date().toISOString(), id],
	)
}

export async function toggleLock(db: Db, id: string): Promise<void> {
	await run(
		db,
		`UPDATE "threads" SET "locked" = CASE "locked" WHEN 1 THEN 0 ELSE 1 END, "updated_at" = ? WHERE "id" = ?`,
		[new Date().toISOString(), id],
	)
}

export async function remove(db: Db, id: string): Promise<void> {
	await run(db, `DELETE FROM "replies" WHERE "threadId" = ?`, [id])
	await run(db, `DELETE FROM "threads" WHERE "id" = ?`, [id])
}

export async function createReply(
	db: Db,
	input: { threadId: string; authorId: string; parentId: string | null; body: string },
): Promise<string> {
	const id = crypto.randomUUID()
	const now = new Date().toISOString()
	await run(
		db,
		`INSERT INTO "replies" ("id","created_at","threadId","authorId","parentId","body") VALUES (?,?,?,?,?,?)`,
		[id, now, input.threadId, input.authorId, input.parentId, input.body],
	)
	return id
}

/**
 * Update a reply's body. Only the original author may edit it — the acting
 * user's id is compared against the reply's stored `authorId`.
 * Returns `'ok'` on success, `'forbidden'` if the user isn't the author, or
 * `'not_found'` if the reply doesn't exist.
 */
export async function updateReply(
	db: Db,
	replyId: string,
	userId: string,
	body: string,
): Promise<'ok' | 'forbidden' | 'not_found'> {
	const rows = await all<{ id: string; authorId: string }>(
		db,
		`SELECT "id", "authorId" FROM "replies" WHERE "id" = ? LIMIT 1`,
		[replyId],
	)
	const existing = rows[0]
	if (!existing) return 'not_found'
	if (existing.authorId !== userId) return 'forbidden'
	await run(db, `UPDATE "replies" SET "body" = ? WHERE "id" = ?`, [body, replyId])
	return 'ok'
}
