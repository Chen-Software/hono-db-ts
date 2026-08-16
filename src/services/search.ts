/**
 * search service — substring search over repository names + descriptions. The
 * user term is bound as a `?` param (LIKE with ESCAPE), never interpolated.
 */
import type { Db } from './types'
import { all } from './types'

export async function search(db: Db, q: string, limit = 20) {
	const like = `%${q.replace(/%/g, '\\%')}%`
	const repositories = await all(
		db,
		`SELECT r.id, r.name, r."lowerName", r.description, r."isPrivate",
		        r."numStars", u.name AS owner_name
		 FROM "repositories" r
		 LEFT JOIN "users" u ON u.id = r."ownerId"
		 WHERE r.name LIKE ? ESCAPE '\\' OR r.description LIKE ? ESCAPE '\\'
		 ORDER BY r."numStars" DESC LIMIT ?`,
		[like, like, limit],
	)
	return { repositories }
}
