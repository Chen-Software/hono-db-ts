/**
 * home service — the forge landing page payload (stats + recent repositories
 * + the repository picker for the "new repository" form).
 */
import type { Db } from './types'
import { all } from './types'
import { PAGE } from './constants'

export interface HomePage {
	stats: any
	repositories: any[]
	allRepositories: any[]
}

export async function getHome(db: Db): Promise<HomePage> {
	const stats = (
		await all(
			db,
			`SELECT (SELECT COUNT(*) FROM "users") AS users,
			        (SELECT COUNT(*) FROM "repositories") AS repositories`,
		)
	)[0] ?? null

	const repositories = await all(
		db,
		`SELECT r.id, r.name, r."lowerName", r.description, r."isPrivate",
		        r."numStars", r."numForks",
		        u.name AS owner_name
		 FROM "repositories" r
		 LEFT JOIN "users" u ON u.id = r."ownerId"
		 ORDER BY r."numStars" DESC, r."created_at" DESC
		 LIMIT ${PAGE.homeBoards}`,
	)

	const allRepositories = await all(
		db,
		`SELECT id, name FROM "repositories" ORDER BY "created_at" DESC LIMIT ${PAGE.allBoards}`,
	)

	return { stats, repositories, allRepositories }
}

/** Site-wide counts (the `/stats` read model). */
export async function getStats(db: Db): Promise<any> {
	return (
		await all(
			db,
			`SELECT (SELECT COUNT(*) FROM "users") AS users,
			        (SELECT COUNT(*) FROM "repositories") AS repositories`,
		)
	)[0] ?? null
}
