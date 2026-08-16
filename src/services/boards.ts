/**
 * boards service — board listing, board detail page, board edit page, and the
 * board create/update mutations. All SQL is `?`-parameterized.
 */
import type { Db } from './types'
import { all, run } from './types'
import { PAGE } from './constants'

export interface BoardIndexPage {
	total: number
	boards: any[]
	users: any[]
	nextCursor: string | null
}

export async function listIndex(db: Db, cursor?: string): Promise<BoardIndexPage> {
	const total = (await all<{ n: number }>(db, `SELECT COUNT(*) AS n FROM "boards"`))[0]?.n ?? 0

	// Keyset on (thread_count DESC, id ASC). The original code referenced an
	// undefined `tc` column here; we wrap the row-builder in a CTE so the
	// computed `thread_count` is a real, referenceable column.
	const where: string[] = []
	const params: unknown[] = []
	if (cursor) {
		const [cnt, id] = cursor.split(':')
		const count = Number(cnt)
		const safe = Number.isNaN(count) ? 0 : count
		if (id) {
			where.push(`(thread_count < ? OR (thread_count = ? AND id > ?))`)
			params.push(safe, safe, id)
		}
	}
	const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

	const boards = await all(
		db,
		`WITH ranked AS (
		   SELECT b.id, b.name, b.slug, b.description, b."created_at",
		          u.name AS moderator_name,
		          (SELECT COUNT(*) FROM "threads" t WHERE t."boardId" = b.id) AS thread_count,
		          (SELECT MAX(t2."updated_at") FROM "threads" t2 WHERE t2."boardId" = b.id) AS last_activity
		   FROM "boards" b
		   LEFT JOIN "users" u ON u.id = b."moderatorId"
		 )
		 SELECT * FROM ranked
		 ${whereSql}
		 ORDER BY thread_count DESC, id ASC
		 LIMIT ${PAGE.boardsIndex}`,
		params,
	)

	const users = await all(db, `SELECT id, name, email FROM "users" ORDER BY "created_at" DESC LIMIT 50`)

	const last: any = boards[boards.length - 1]
	const nextCursor = boards.length === PAGE.boardsIndex && last ? `${last.thread_count}:${last.id}` : null
	return { total, boards, users, nextCursor }
}

export interface BoardPage {
	board: any
	total: number
	threads: any[]
	authors: any[]
	hot: any[]
	users: any[]
	nextCursor: string | null
}

export async function getPage(db: Db, uuid: string, cursor?: string): Promise<BoardPage> {
	const boardRows = await all(
		db,
		`SELECT b.id, b.name, b.slug, b.description, b."moderatorId", b."created_at",
		        u.name AS moderator_name,
		        (SELECT COUNT(*) FROM "threads" t WHERE t."boardId" = b.id) AS thread_count
		 FROM "boards" b
		 LEFT JOIN "users" u ON u.id = b."moderatorId"
		 WHERE b.id = ?
		 LIMIT 1`,
		[uuid],
	)
	const board = boardRows[0] ?? null

	let total = 0
	let threads: any[] = []
	let authors: any[] = []
	let hot: any[] = []
	let users: any[] = []
	let nextCursor: string | null = null

	if (board) {
		const where = ['t."boardId" = ?']
		const params: unknown[] = [uuid]
		if (cursor) {
			where.push(`t."updated_at" < ?`)
			params.push(cursor)
		}
		const whereSql = `WHERE ${where.join(' AND ')}`

		total = (await all<{ n: number }>(db, `SELECT COUNT(*) AS n FROM "threads" t ${whereSql}`, params))[0]?.n ?? 0

		threads = await all(
			db,
			`SELECT t.id, t.title, t.pinned, t.locked, t."created_at", t."updated_at",
			        u.name AS author_name,
			        (SELECT COUNT(*) FROM "replies" r WHERE r."threadId" = t.id) AS reply_count
			 FROM "threads" t
			 LEFT JOIN "users" u ON u.id = t."authorId"
			 ${whereSql}
			 ORDER BY t.pinned DESC, t."updated_at" DESC
			 LIMIT ${PAGE.boardThreads}`,
			params,
		)
		authors = await all(db, `SELECT id, name FROM "users" ORDER BY "created_at" DESC LIMIT 20`)
		hot = await all(
			db,
			`SELECT t.id, t.title, COUNT(r.id) AS reply_count
			 FROM "threads" t
			 LEFT JOIN "replies" r ON r."threadId" = t.id
			 WHERE t."boardId" = ?
			 GROUP BY t.id
			 ORDER BY reply_count DESC, t."updated_at" DESC
			 LIMIT 6`,
			[uuid],
		)
		users = await all(db, `SELECT id, name, email FROM "users" ORDER BY "created_at" DESC LIMIT 50`)

		const last: any = threads[threads.length - 1]
		nextCursor = threads.length === PAGE.boardThreads && last ? last.updated_at : null
	}

	return { board, total, threads, authors, hot, users, nextCursor }
}

/** Board by id with its moderator ({ ...board, moderator }). */
export async function getWithModerator(db: Db, id: string): Promise<any> {
	const board = (await all(db, `SELECT * FROM "boards" WHERE "id" = ? LIMIT 1`, [id]))[0]
	if (!board) return null
	const moderator = (await all(db, `SELECT id, name, email FROM "users" WHERE "id" = ?`, [board.moderatorId]))[0] ?? null
	return { ...board, moderator }
}

/** Threads within a board (supports `pinned` + keyset `cursor`). */
export async function listThreads(
	db: Db,
	id: string,
	opts: { pinned?: string; cursor?: string; limit?: number } = {},
): Promise<{ rows: any[]; nextCursor: string | null }> {
	const conds = ['"boardId" = ?']
	const params: unknown[] = [id]
	if (opts.pinned === 'true') conds.push(`"pinned" = 1`)
	else if (opts.pinned === 'false') conds.push(`"pinned" = 0`)
	if (opts.cursor) {
		conds.push(`"updated_at" < ?`)
		params.push(opts.cursor)
	}
	const limit = opts.limit ?? PAGE.boardThreads
	const rows = await all(
		db,
		`SELECT * FROM "threads" WHERE ${conds.join(' AND ')} ORDER BY "updated_at" DESC LIMIT ${limit}`,
		params,
	)
	const last: any = rows[rows.length - 1]
	const nextCursor = rows.length === limit && last ? last.updated_at : null
	return { rows, nextCursor }
}

export async function getEdit(db: Db, uuid: string): Promise<{ board: any; users: any[] }> {
	const boardRows = await all(db, `SELECT id, name, slug, description, "moderatorId" FROM "boards" WHERE "id" = ? LIMIT 1`, [uuid])
	const board = boardRows[0] ?? null
	const users = await all(db, `SELECT id, name, email FROM "users" ORDER BY "created_at" DESC LIMIT 50`)
	return { board, users }
}

export async function create(
	db: Db,
	input: { name: string; slug: string; description: string; moderatorId: string },
): Promise<string> {
	const id = crypto.randomUUID()
	const now = new Date().toISOString()
	await run(
		db,
		`INSERT INTO "boards" ("id","created_at","name","slug","description","moderatorId") VALUES (?,?,?,?,?,?)`,
		[id, now, input.name, input.slug, input.description, input.moderatorId],
	)
	return id
}

export async function update(
	db: Db,
	id: string,
	patch: { name: string; slug: string; description: string; moderatorId: string },
): Promise<void> {
	await run(
		db,
		`UPDATE "boards" SET "name" = ?, "slug" = ?, "description" = ?, "moderatorId" = ? WHERE "id" = ?`,
		[patch.name, patch.slug, patch.description, patch.moderatorId, id],
	)
}
