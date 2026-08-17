/**
 * services/types — shared types + tiny query helpers for the service layer.
 *
 * The request path no longer touches `SqlQueryExecutor.unsafe` directly. The
 * entry points (app/server.ts, scripts/serve.ts) build a Drizzle SQLite
 * database with `drizzle-orm/libsql` (the stable SQLite driver — it binds the
 * client correctly and exposes `.all` / `.run` / `.get`), while the Cloudflare
 * Worker (app/server.cf.ts) uses `drizzle-orm/d1`. Both hand the resulting
 * Drizzle SQLite database to the service layer. `all` / `run` execute through
 * Drizzle's *parameterised* path (the `sql` template), so a `?`-style query +
 * params is bound safely and never string-interpolated.
 *
 * The business tables themselves come from the `SqlSerialisable` capacity:
 * every model registers its derived Drizzle `Table` in `tableRegistry`, so a
 * service can grab it dialect-safely with
 * `resolveTableThunk('<Model>Schema', 'sqlite')()`. That means services can
 * also use the full Drizzle query builder (see `users.ts` for the reference
 * implementation) instead of raw SQL — but `all` / `run` remain as a safe,
 * low-level escape hatch for the queries that are awkward to express in the
 * builder (correlated subqueries, etc.).
 */
import { sql, type SQL } from 'drizzle-orm'

/**
 * The Drizzle SQLite database the service layer talks to. Concretely this is
 * whatever `drizzle(client)` returns for the active backend (bun-sql / d1 /
 * libsql) — they all extend the same SQLite async base. Returns are typed
 * loosely on purpose: the service layer is already loosely typed and the real
 * gate is the Vite build, and keeping `Db` structural lets every backend be
 * assignable without dragging a concrete driver type into the services.
 */
export interface Db {
	all: (q: SQL | string) => any
	run: (q: SQL | string) => any
	get: (q: SQL | string) => any
	select: (columns?: unknown) => any
	insert: (table?: unknown) => any
	update: (table?: unknown) => any
	delete: (table?: unknown) => any
}

/**
 * Convert a `?`-parameterised query string + params into a Drizzle `SQL`.
 *
 * Each `?` is bound via Drizzle's `${param}` interpolation (parameterised — NOT
 * string concatenation), and the literal SQL fragments between them are
 * embedded with `sql.raw` (which is safe here because those fragments are
 * developer-authored query text, never user input). This is what lets the
 * existing hand-written queries keep running through Drizzle without
 * re-authoring them, while still shedding `SqlQueryExecutor.unsafe`.
 */
function toSql(query: string, params: unknown[]): SQL {
	const segs = query.split('?')
	let acc: SQL = sql``
	// The number of `?` placeholders is (segs.length - 1). Binding a param
	// after the FINAL segment would emit a trailing `?` and a SQL syntax error
	// ("near ?: syntax error"), and binding more params than there are `?`s is
	// always a caller bug. Cap binding at the placeholder count so a mismatch
	// can never produce a trailing `?`.
	const placeholders = segs.length - 1
	for (let i = 0; i < segs.length; i++) {
		if (segs[i]) acc = sql`${acc}${sql.raw(segs[i])}`
		if (i < placeholders && i < params.length) acc = sql`${acc}${params[i]}`
	}
	return acc
}

/** Run a SELECT and return the rows (always parameterised through Drizzle). */
export async function all<T = Record<string, unknown>>(
	db: Db,
	query: string,
	params: unknown[] = [],
): Promise<T[]> {
	return (await db.all(toSql(query, params))) as T[]
}

/** Run an INSERT/UPDATE/DELETE (always parameterised through Drizzle). */
export async function run(db: Db, query: string, params: unknown[] = []): Promise<void> {
	await db.run(toSql(query, params))
}
