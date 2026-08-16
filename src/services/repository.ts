/**
 * repository service — repository index, repository detail page, and the
 * repository create/update mutations. All SQL is `?`-parameterized.
 *
 * Mirrors the old `boards` service but targets the `repositories` table (the
 * Forgejo-style Git repo model in `src/models/repository.ts`). The owner is
 * joined from `users`. This is the MVP data-access layer for the forge's
 * top-level unit; issues/PRs/branches are later milestones.
 */
import type { Db } from './types'
import { all, run } from './types'
import { PAGE } from './constants'

export interface RepositoryIndexPage {
	total: number
	repositories: any[]
	users: any[]
	nextCursor: string | null
}

export async function listIndex(db: Db, cursor?: string): Promise<RepositoryIndexPage> {
	const total = (await all<{ n: number }>(db, `SELECT COUNT(*) AS n FROM "repositories"`))[0]?.n ?? 0

	// Keyset on (numStars DESC, id ASC).
	const where: string[] = []
	const params: unknown[] = []
	if (cursor) {
		const [stars, id] = cursor.split(':')
		const starsN = Number(stars)
		const safe = Number.isNaN(starsN) ? 0 : starsN
		if (id) {
			where.push(`(r."numStars" < ? OR (r."numStars" = ? AND r."id" > ?))`)
			params.push(safe, safe, id)
		}
	}
	const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

	const repositories = await all(
		db,
		`SELECT r.id, r.name, r."lowerName", r.description, r."isPrivate",
		        r."defaultBranch", r."numStars", r."numForks", r."numOpenIssues",
		        u.name AS owner_name, u.id AS owner_id
		 FROM "repositories" r
		 LEFT JOIN "users" u ON u.id = r."ownerId"
		 ${whereSql}
		 ORDER BY r."numStars" DESC, r."id" ASC
		 LIMIT ${PAGE.repositoriesIndex}`,
		params,
	)

	const users = await all(db, `SELECT id, name, email FROM "users" ORDER BY "created_at" DESC LIMIT 50`)

	const last: any = repositories[repositories.length - 1]
	const nextCursor = repositories.length === PAGE.repositoriesIndex && last ? `${last.numStars}:${last.id}` : null
	return { total, repositories, users, nextCursor }
}

export interface RepositoryPage {
	repository: any
	owner: any
	users: any[]
}

export async function getPage(db: Db, uuid: string): Promise<RepositoryPage> {
	const repoRows = await all(
		db,
		`SELECT r.*, u.name AS owner_name, u.id AS owner_id, u.email AS owner_email
		 FROM "repositories" r
		 LEFT JOIN "users" u ON u.id = r."ownerId"
		 WHERE r.id = ?
		 LIMIT 1`,
		[uuid],
	)
	const repository = repoRows[0] ?? null
	let owner: any = null
	if (repository?.owner_id) {
		owner = { id: repository.owner_id, name: repository.owner_name, email: repository.owner_email }
	}
	const users = await all(db, `SELECT id, name, email FROM "users" ORDER BY "created_at" DESC LIMIT 50`)
	return { repository, owner, users }
}

/** Repository by id with its owner ({ ...repository, owner }). */
export async function getWithOwner(db: Db, id: string): Promise<any> {
	const repo = (await all(db, `SELECT * FROM "repositories" WHERE "id" = ? LIMIT 1`, [id]))[0]
	if (!repo) return null
	const owner = (await all(db, `SELECT id, name, email FROM "users" WHERE "id" = ?`, [repo.ownerId]))[0] ?? null
	return { ...repo, owner }
}

export async function getEdit(db: Db, uuid: string): Promise<{ repository: any; users: any[] }> {
	const repoRows = await all(
		db,
		`SELECT id, name, "lowerName", description, "isPrivate", "defaultBranch", website FROM "repositories" WHERE "id" = ? LIMIT 1`,
		[uuid],
	)
	const repository = repoRows[0] ?? null
	const users = await all(db, `SELECT id, name, email FROM "users" ORDER BY "created_at" DESC LIMIT 50`)
	return { repository, users }
}

export interface CreateRepositoryInput {
	ownerId: string
	name: string
	lowerName: string
	description?: string
	defaultBranch?: string
	isPrivate?: boolean
}

export async function create(db: Db, input: CreateRepositoryInput): Promise<string> {
	const id = crypto.randomUUID()
	const description = input.description ?? ''
	const defaultBranch = input.defaultBranch ?? 'main'
	const isPrivate = input.isPrivate ? 1 : 0
	const now = new Date().toISOString()
	await run(
		db,
		`INSERT INTO "repositories" (
			"id","created_at","ownerId","name","lowerName","description",
			"defaultBranch","website","isPrivate","isArchived","isMirror","isTemplate",
			"objectFormatName","topics","numStars","numForks","numOpenIssues",
			"numClosedIssues","size","avatar","status"
		) VALUES (?,?,?,?,?,?,?,?,?,0,0,0,'sha1','[]',0,0,0,0,0,'',0)`,
		[id, now, input.ownerId, input.name, input.lowerName, description, defaultBranch, '', isPrivate],
	)
	return id
}

export interface UpdateRepositoryInput {
	name?: string
	lowerName?: string
	description?: string
	defaultBranch?: string
	isPrivate?: boolean
}

export async function update(db: Db, id: string, patch: UpdateRepositoryInput): Promise<void> {
	const sets: string[] = []
	const params: unknown[] = []
	if (patch.name != null) {
		sets.push(`"name" = ?`)
		params.push(patch.name)
	}
	if (patch.lowerName != null) {
		sets.push(`"lowerName" = ?`)
		params.push(patch.lowerName)
	}
	if (patch.description != null) {
		sets.push(`"description" = ?`)
		params.push(patch.description)
	}
	if (patch.defaultBranch != null) {
		sets.push(`"defaultBranch" = ?`)
		params.push(patch.defaultBranch)
	}
	if (patch.isPrivate != null) {
		sets.push(`"isPrivate" = ?`)
		params.push(patch.isPrivate ? 1 : 0)
	}
	if (!sets.length) return
	await run(db, `UPDATE "repositories" SET ${sets.join(', ')} WHERE "id" = ?`, [...params, id])
}

/** Repositories owned by a given user, newest first (the profile page). */
export async function listByOwner(db: Db, ownerId: string, limit = 50): Promise<any[]> {
	return all(
		db,
		`SELECT r.id, r.name, r."lowerName", r.description, r."isPrivate",
		        r."numStars", r."numForks", r."numOpenIssues", r."numClosedIssues",
		        r."created_at", u.name AS owner_name
		 FROM "repositories" r
		 LEFT JOIN "users" u ON u.id = r."ownerId"
		 WHERE r."ownerId" = ?
		 ORDER BY r."created_at" DESC
		 LIMIT ?`,
		[ownerId, limit],
	)
}

