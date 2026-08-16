/**
 * posts service — post index, post detail page, post edit page, and the post
 * update mutation. All SQL is `?`-parameterized. `contentHash` is recomputed
 * via `hashContent` (the same helper the SSR edit route used).
 */
import type { Db } from './types'
import { all, run } from './types'
import { PAGE } from './constants'
import { hashContent } from '@/capacities/hashable'

export interface PostIndexPage {
	posts: any[]
	total: number
	nextCursor: string | null
}

export async function listIndex(
	db: Db,
	opts: { published?: string; cursor?: string },
): Promise<PostIndexPage> {
	const where: string[] = []
	const params: unknown[] = []
	if (opts.published === '1') where.push(`p."published" = 1`)
	else if (opts.published === '0') where.push(`p."published" = 0`)
	else where.push(`p."published" = 1`) // default: published only
	if (opts.cursor) {
		where.push(`p."updated_at" < ?`)
		params.push(opts.cursor)
	}
	const whereSql = `WHERE ${where.join(' AND ')}`

	const total = (await all<{ n: number }>(db, `SELECT COUNT(*) AS n FROM "posts" p ${whereSql}`, params))[0]?.n ?? 0

	const posts = await all(
		db,
		`SELECT p.id, p.title, p.published, p."updated_at", u.name AS author_name
		 FROM "posts" p
		 LEFT JOIN "users" u ON u.id = p."authorId"
		 ${whereSql}
		 ORDER BY p."updated_at" DESC
		 LIMIT ${PAGE.postsIndex}`,
		params,
	)

	const last: any = posts[posts.length - 1]
	const nextCursor = posts.length === PAGE.postsIndex && last ? last.updated_at : null
	return { posts, total, nextCursor }
}

export async function get(db: Db, uuid: string): Promise<any> {
	const rows = await all(
		db,
		`SELECT p.id, p.title, p.body, p.published, p."contentHash", p."created_at", p."updated_at",
		        u.name AS author_name, u.email AS author_email
		 FROM "posts" p
		 LEFT JOIN "users" u ON u.id = p."authorId"
		 WHERE p.id = ?
		 LIMIT 1`,
		[uuid],
	)
	return rows[0] ?? null
}

export async function getEdit(db: Db, uuid: string): Promise<any> {
	const rows = await all(db, `SELECT id, title, body, published, "contentHash" FROM "posts" WHERE "id" = ? LIMIT 1`, [uuid])
	return rows[0] ?? null
}

/** Globally latest published posts (the `/latest-posts` read model). */
export async function latest(db: Db, limit = 20): Promise<any[]> {
	return all(
		db,
		`SELECT p.id, p.title, p.body, p."authorId", p."contentHash", p."created_at", p."updated_at",
		        u.name AS author_name
		 FROM "posts" p LEFT JOIN "users" u ON u.id = p."authorId"
		 WHERE p.published = 1 ORDER BY p."updated_at" DESC LIMIT ?`,
		[limit],
	)
}

export async function update(
	db: Db,
	id: string,
	patch: { title: string; body: string; published: number },
): Promise<void> {
	const contentHash = hashContent(patch.body)
	await run(
		db,
		`UPDATE "posts" SET "title" = ?, "body" = ?, "published" = ?, "contentHash" = ?, "updated_at" = ? WHERE "id" = ?`,
		[patch.title, patch.body, patch.published, contentHash, new Date().toISOString(), id],
	)
}
