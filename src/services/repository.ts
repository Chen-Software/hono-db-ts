/**
 * repository service — repository index, repository detail page, and the
 * repository create/update mutations.
 *
 * Targets the `repositories` table (the Forgejo-style Git repo model in
 * `src/models/repository.ts`), joined to `users` for the owner. Written with
 * the Drizzle query builder using the tables that the `SqlSerialisable`
 * capacity derives from the reflected `RepositorySchema` / `UserSchema`
 * schemas and registers in `tableRegistry` — mirroring `users.ts` (the
 * reference implementation). No raw `sql.unsafe` and no hand-written SQL
 * strings: `db.select()` / `db.insert()` / `db.update()` bind every value
 * through Drizzle.
 */
import { and, asc, count, desc, eq, gt, lt, or } from 'drizzle-orm'
import { resolveTableThunk } from '@/capacities/sql-serialisable'
import { PAGE } from './constants'
import type { Db } from './types'

// Drizzle tables derived by `SqlSerialisable` and registered under the model
// names. Cast to `any` so the column references (e.g. `repos.ownerId`) work
// without fighting the untyped `Table` — the service layer is intentionally
// loosely typed, and the real gate is the Vite build.
const repos = resolveTableThunk('RepositorySchema', 'sqlite')() as any
const users = resolveTableThunk('UserSchema', 'sqlite')() as any

export interface RepositoryIndexPage {
	total: number
	repositories: any[]
	users: any[]
	nextCursor: string | null
}

export async function listIndex(db: Db, cursor?: string): Promise<RepositoryIndexPage> {
	const [{ n: total }] = await db.select({ n: count() }).from(repos)

	// Keyset on (numStars DESC, id ASC).
	const conds: any[] = []
	if (cursor) {
		const [stars, id] = cursor.split(':')
		const starsN = Number(stars)
		const safe = Number.isNaN(starsN) ? 0 : starsN
		if (id) {
			conds.push(or(lt(repos.numStars, safe), and(eq(repos.numStars, safe), gt(repos.id, id))))
		}
	}

	const repositories = await db
		.select({
			id: repos.id,
			name: repos.name,
			lowerName: repos.lowerName,
			description: repos.description,
			isPrivate: repos.isPrivate,
			defaultBranch: repos.defaultBranch,
			numStars: repos.numStars,
			numForks: repos.numForks,
			numOpenIssues: repos.numOpenIssues,
			owner_name: users.name,
			owner_id: users.id,
		})
		.from(repos)
		.leftJoin(users, eq(repos.ownerId, users.id))
		.where(conds.length ? and(...conds) : undefined)
		.orderBy(desc(repos.numStars), asc(repos.id))
		.limit(PAGE.repositoriesIndex)

	const recentUsers = await db
		.select({ id: users.id, name: users.name, email: users.email })
		.from(users)
		.orderBy(desc(users.created_at))
		.limit(50)

	const last: any = repositories[repositories.length - 1]
	const nextCursor = repositories.length === PAGE.repositoriesIndex && last ? `${last.numStars}:${last.id}` : null
	return { total, repositories, users: recentUsers, nextCursor }
}

export interface RepositoryPage {
	repository: any
	owner: any
	users: any[]
}

export async function getPage(db: Db, uuid: string): Promise<RepositoryPage> {
	const repoRows = await db
		.select({
			id: repos.id,
			created_at: repos.created_at,
			ownerId: repos.ownerId,
			name: repos.name,
			lowerName: repos.lowerName,
			description: repos.description,
			defaultBranch: repos.defaultBranch,
			website: repos.website,
			isPrivate: repos.isPrivate,
			isArchived: repos.isArchived,
			isMirror: repos.isMirror,
			isTemplate: repos.isTemplate,
			objectFormatName: repos.objectFormatName,
			topics: repos.topics,
			numStars: repos.numStars,
			numForks: repos.numForks,
			numOpenIssues: repos.numOpenIssues,
			numClosedIssues: repos.numClosedIssues,
			size: repos.size,
			avatar: repos.avatar,
			status: repos.status,
			owner_name: users.name,
			owner_id: users.id,
			owner_email: users.email,
		})
		.from(repos)
		.leftJoin(users, eq(repos.ownerId, users.id))
		.where(eq(repos.id, uuid))
		.limit(1)
	const repository = repoRows[0] ?? null
	let owner: any = null
	if (repository?.owner_id) {
		owner = { id: repository.owner_id, name: repository.owner_name, email: repository.owner_email }
	}
	const recentUsers = await db
		.select({ id: users.id, name: users.name, email: users.email })
		.from(users)
		.orderBy(desc(users.created_at))
		.limit(50)
	return { repository, owner, users: recentUsers }
}

/** Repository by id with its owner ({ ...repository, owner }). */
export async function getWithOwner(db: Db, id: string): Promise<any> {
	const repo = (await db.select().from(repos).where(eq(repos.id, id)).limit(1))[0]
	if (!repo) return null
	const owner = (await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, repo.ownerId)).limit(1))[0] ?? null
	return { ...repo, owner }
}

export async function getEdit(db: Db, uuid: string): Promise<{ repository: any; users: any[] }> {
	const repoRows = await db
		.select({
			id: repos.id,
			name: repos.name,
			lowerName: repos.lowerName,
			description: repos.description,
			isPrivate: repos.isPrivate,
			defaultBranch: repos.defaultBranch,
			website: repos.website,
		})
		.from(repos)
		.where(eq(repos.id, uuid))
		.limit(1)
	const repository = repoRows[0] ?? null
	const recentUsers = await db
		.select({ id: users.id, name: users.name, email: users.email })
		.from(users)
		.orderBy(desc(users.created_at))
		.limit(50)
	return { repository, users: recentUsers }
}

export interface CreateRepositoryInput {
	ownerId: string
	name: string
	lowerName: string
	description?: string
	defaultBranch?: string
	isPrivate?: boolean
}

/**
 * The routable name grammar — mirrors the model's `lowerName` tag
 * (`^[a-z0-9]+(?:-[a-z0-9]+)*$`). Anything else can't be addressed as
 * `{owner}/{repo}.git`, so it is rejected at create time.
 */
export const REPO_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export class InvalidRepositoryNameError extends Error {
	readonly kind = 'invalid-name' as const
	constructor(name: string) {
		super(`invalid repository name: "${name}" (use lowercase letters, digits, and single hyphens)`)
	}
}

export class DuplicateRepositoryError extends Error {
	readonly kind = 'duplicate' as const
	constructor(_ownerId: string, lowerName: string) {
		super(`a repository named "${lowerName}" already exists for this user`)
	}
}

export async function create(db: Db, input: CreateRepositoryInput): Promise<string> {
	if (!REPO_NAME_PATTERN.test(input.lowerName)) {
		throw new InvalidRepositoryNameError(input.lowerName)
	}
	// One `{owner}/{repo}` per owner — the git route `getByOwnerAndName` must
	// never be ambiguous. Mirrors Forgejo's unique (OwnerID, LowerName) index.
	const existing = await db
		.select({ id: repos.id })
		.from(repos)
		.where(and(eq(repos.ownerId, input.ownerId), eq(repos.lowerName, input.lowerName)))
		.limit(1)
	if (existing.length > 0) throw new DuplicateRepositoryError(input.ownerId, input.lowerName)
	const id = crypto.randomUUID()
	await db.insert(repos).values({
		id,
		created_at: new Date().toISOString(),
		ownerId: input.ownerId,
		name: input.name,
		lowerName: input.lowerName,
		description: input.description ?? '',
		defaultBranch: input.defaultBranch ?? 'main',
		website: '',
		isPrivate: input.isPrivate ? 1 : 0,
		isArchived: 0,
		isMirror: 0,
		isTemplate: 0,
		objectFormatName: 'sha1',
		topics: '[]',
		numStars: 0,
		numForks: 0,
		numOpenIssues: 0,
		numClosedIssues: 0,
		size: 0,
		avatar: '',
		status: 0,
	})
	return id
}

export interface UpdateRepositoryInput {
	name?: string
	lowerName?: string
	description?: string
	defaultBranch?: string
	website?: string
	isPrivate?: boolean
	isTemplate?: boolean
	isArchived?: boolean
}

export async function update(db: Db, id: string, patch: UpdateRepositoryInput): Promise<void> {
	const set: Record<string, unknown> = {}
	if (patch.name != null) set['name'] = patch.name
	if (patch.lowerName != null) set['lowerName'] = patch.lowerName
	if (patch.description != null) set['description'] = patch.description
	if (patch.defaultBranch != null) set['defaultBranch'] = patch.defaultBranch
	if (patch.website != null) set['website'] = patch.website
	if (patch.isPrivate != null) set['isPrivate'] = patch.isPrivate ? 1 : 0
	if (patch.isTemplate != null) set['isTemplate'] = patch.isTemplate ? 1 : 0
	if (patch.isArchived != null) set['isArchived'] = patch.isArchived ? 1 : 0
	if (!Object.keys(set).length) return
	await db.update(repos).set(set).where(eq(repos.id, id))
}

/** Resolve a repository by its owner's login + its (lower-cased) name — the
 *  mapping the git smart-HTTP transport needs (`/owner/repo.git`). */
export async function getByOwnerAndName(db: Db, ownerLogin: string, repoName: string): Promise<any | null> {
	const rows = await db
		.select({
			id: repos.id,
			created_at: repos.created_at,
			ownerId: repos.ownerId,
			name: repos.name,
			lowerName: repos.lowerName,
			description: repos.description,
			defaultBranch: repos.defaultBranch,
			website: repos.website,
			isPrivate: repos.isPrivate,
			isArchived: repos.isArchived,
			isMirror: repos.isMirror,
			isTemplate: repos.isTemplate,
			objectFormatName: repos.objectFormatName,
			topics: repos.topics,
			numStars: repos.numStars,
			numForks: repos.numForks,
			numOpenIssues: repos.numOpenIssues,
			numClosedIssues: repos.numClosedIssues,
			size: repos.size,
			avatar: repos.avatar,
			status: repos.status,
			owner_name: users.name,
			owner_id: users.id,
		})
		.from(repos)
		.leftJoin(users, eq(repos.ownerId, users.id))
		.where(and(eq(users.name, ownerLogin), eq(repos.lowerName, repoName.toLowerCase())))
		.limit(1)
	const repo = rows[0] ?? null
	if (!repo) return null
	return { ...repo, isPrivate: !!repo.isPrivate }
}

/** Repositories owned by a given user, newest first (the profile page). */
export async function listByOwner(db: Db, ownerId: string, limit = 50): Promise<any[]> {
	return db
		.select({
			id: repos.id,
			name: repos.name,
			lowerName: repos.lowerName,
			description: repos.description,
			isPrivate: repos.isPrivate,
			numStars: repos.numStars,
			numForks: repos.numForks,
			numOpenIssues: repos.numOpenIssues,
			numClosedIssues: repos.numClosedIssues,
			created_at: repos.created_at,
			owner_name: users.name,
		})
		.from(repos)
		.leftJoin(users, eq(repos.ownerId, users.id))
		.where(eq(repos.ownerId, ownerId))
		.orderBy(desc(repos.created_at))
		.limit(limit)
}
