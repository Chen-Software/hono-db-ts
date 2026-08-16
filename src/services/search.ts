/**
 * search service — substring search over thread + post titles. The user term
 * is bound as a `?` param (LIKE with ESCAPE), never interpolated.
 */
import type { Db } from './types'
import { all } from './types'

export async function search(db: Db, q: string, limit = 20) {
	const like = `%${q.replace(/%/g, '\\%')}%`
	const threads = await all(
		db,
		`SELECT t.id, t.title, t."boardId", t."authorId", t."updated_at",
		        u.name AS author_name, b.name AS board_name
		 FROM "threads" t
		 LEFT JOIN "users" u ON u.id = t."authorId"
		 LEFT JOIN "boards" b ON b.id = t."boardId"
		 WHERE t.title LIKE ? ESCAPE '\\' ORDER BY t."updated_at" DESC LIMIT ?`,
		[like, limit],
	)
	const posts = await all(
		db,
		`SELECT p.id, p.title, p."authorId", p."updated_at", u.name AS author_name
		 FROM "posts" p
		 LEFT JOIN "users" u ON u.id = p."authorId"
		 WHERE p.title LIKE ? ESCAPE '\\' ORDER BY p."updated_at" DESC LIMIT ?`,
		[like, limit],
	)
	return { threads, posts }
}
