/**
 * Dialect factory + lazy singleton.
 *
 * Reads `DATABASE_TYPE` / `DATABASE_URL` **at build time** via Bun macros (see
 * `src/macros/db.ts`), so the active dialect is a compile-time constant and the
 * bundler drops the unused dialect branch. Both dialects expose the same
 * `movies` surface, so application code never imports dialect modules directly.
 *
 * NOTE: The dialect-specific client modules (`sqlite-client.ts`,
 * `postgres-client.ts`) are imported statically here for the local runtime.
 * Bun macros only execute under Bun's bundler — Wrangler bundles Workers with
 * esbuild, which does not run them. The Worker entry (`src/worker.ts`) therefore
 * never imports this module and instead uses D1 directly.
 */

import { dialect as macroDialect } from "../macros/db" with { type: "macro" };
import type { DbDialect } from "../macros/db";
import type { PostgresDb } from "./postgres-client";
import { createPostgresClient } from "./postgres-client";
import type { SqliteDb } from "./sqlite-client";
import { createSqliteClient } from "./sqlite-client";

const DEFAULT_SQLITE_URL = "sqlite.db";
const DEFAULT_PG_URL = "postgres://postgres:postgres@localhost:5432/mydb";

let instance: Db | undefined;

/**
 * The active dialect, resolved at build time by the macro.
 * Unknown `DATABASE_TYPE` values fall back to SQLite.
 */
function resolveDialect(): DbDialect {
	return macroDialect();
}

/**
 * The connection URL, resolved at build time by the macro.
 * Falls back to the dialect-appropriate default when `DATABASE_URL` is unset.
 */
function resolveUrl(): string {
	const url = process.env["DATABASE_URL"];
	if (url) return url;
	const d = macroDialect();
	return d === "postgres" || d === "neon" ? DEFAULT_PG_URL : DEFAULT_SQLITE_URL;
}

// The SQLite client is always the local `sqlite.db` file — it must NOT read the
// shared `DATABASE_URL`, which points at a Postgres/Neon server for other dialects.
function resolveSqliteUrl(): string {
	return DEFAULT_SQLITE_URL;
}

function createDb(dialect: DbDialect, url: string): Db {
	if (dialect === "postgres" || dialect === "neon")
		return createPostgresClient(url, poolSize());
	if (dialect === "d1") {
		// D1 is a Cloudflare Worker runtime binding (`env.DB`), so there is no
		// local driver to construct. Use `src/worker.ts` + `wrangler dev` instead.
		throw new Error(
			"`DATABASE_TYPE=d1` is a Worker-runtime binding and has no local " +
				"driver. Use `bun run worker:dev` (which reads env.DB) or set " +
				"`DATABASE_TYPE` to `sqlite` / `postgres` / `neon` locally.",
		);
	}
	return createSqliteClient(url);
}

function poolSize(): number {
	const raw = process.env["DATABASE_POOL_SIZE"];
	if (!raw) return 10;
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? n : 10;
}

function getDb(): Db {
	if (instance) return instance;
	instance = createDb(resolveDialect(), resolveUrl());
	return instance;
}

function resetDb(): void {
	instance = undefined;
}

function isSqliteDb(db: Db): db is SqliteDb {
	const client = (db as { $client?: unknown }).$client;
	return client !== undefined;
}

function isPostgresDb(db: Db): db is PostgresDb {
	return !isSqliteDb(db);
}

export type Db = SqliteDb | PostgresDb;

export type { DbDialect };

/**
 * The shared Drizzle client for the active dialect.
 * The dialect is chosen at build time by `src/macros/db.ts`.
 */
export const db = getDb();

/**
 * A concrete SQLite client for SQLite-specific consumers (the local repo,
 * seed, and tests). Always targets the local `sqlite.db` file regardless of the
 * active dialect's `DATABASE_URL`.
 */
export const sqliteDb = createSqliteClient(resolveSqliteUrl());

export { getDb, createDb, resetDb, resolveDialect, isSqliteDb, isPostgresDb };
