/**
 * Unified Drizzle client — single source for every dialect's client.
 *
 * Everything about building a Drizzle client lives here: the shared `client`
 * singleton (from `.env` / `NODE_ENV`) AND the factory functions the Worker and
 * tests use to build client-specific instances from their own connection inputs.
 *
 * This module is a **runtime** module: a Bun macro cannot return a client object
 * (macros only inline literals). `dbDialect()` is a build-time macro that inlines
 * the dialect literal; the `switch` below then resolves, and the matching
 * `import(<literal>)` is statically analyzed by the bundler, so only the selected
 * driver ships.
 *
 * Dialect handling (factories, all exported):
 *   - `turso`            -> `createTursoClient` (`@libsql/client`, local or cloud)
 *   - `turso` (Worker)   -> `createTursoWorkerClient` (`@libsql/client/http`)
 *   - `neon` / `postgres`-> `createPostgresClient` (`postgres-js`)
 *   - `neon` (Worker)    -> `createNeonHyperdriveClient` (`postgres-js` via Hyperdrive)
 *   - `sqlite`           -> `createSqliteClient` (`bun:sqlite`)
 *   - `d1` (Worker)      -> `createD1Client` (Drizzle D1 binding)
 *
 * `createClient()` selects the remote vs local client for the active dialect:
 *   - `NODE_ENV=development` (or `db:seed --dev`) → loads the matching
 *     `.env.dev.<type>` and creates the **local** dev client.
 *   - otherwise (production / CI) → creates the **remote** client from `.env`
 *     (Turso Cloud, Neon, or local-path defaults for a single-writer setup).
 *   - `d1` has no local client outside a Worker binding, so `createClient()`
 *     falls back to the local `bun:sqlite` client for local/CLI use.
 */

import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { drizzle as d1Drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { drizzle as libDrizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import {
	drizzle as pgDrizzle,
	type PostgresJsDatabase,
} from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { Database } from "bun:sqlite";
import { createClient as createLibsqlClient } from "@libsql/client";
import { createClient as createLibsqlHttpClient } from "@libsql/client/http";
import { dbDialect } from "../macros/db-dialect" with { type: "macro" };
import {
	devEnvFile,
	loadEnvFile,
} from "../macros/dev-env" with { type: "macro" };
import * as pgSchema from "./schema/postgres";
import * as sqliteSchema from "./schema/sqlite";

// ─── Types ───────────────────────────────────────────────────────────────────

/** SQLite-family Drizzle client. */
export type SqliteDb = BunSQLiteDatabase<typeof sqliteSchema.schema>;
/** Postgres / Neon Drizzle client. */
export type PostgresDb = PostgresJsDatabase<typeof pgSchema.schema>;
/** Turso (libSQL) Drizzle client. */
export type TursoDb = LibSQLDatabase<typeof sqliteSchema.schema>;
/** Turso HTTP (Worker) Drizzle client. */
export type TursoWorkerDb = LibSQLDatabase<typeof sqliteSchema.schema>;
/** Cloudflare D1 Drizzle client. */
export type D1Db = DrizzleD1Database<typeof sqliteSchema>;

/** The union of all dialect Drizzle clients `createClient()` can return. */
export type DialectDb = TursoDb | PostgresDb | SqliteDb;

/** A connected Drizzle client with a generic cleanup helper. */
export interface DbClient<TDb extends DialectDb = DialectDb> {
	/** The dialect-specific Drizzle client. */
	db: TDb;
	/** Close the underlying driver connection (async-safe; no-op for sqlite). */
	close: () => Promise<void>;
}

// ─── Factory functions (used by Worker, tests, CLI) ──────────────────────────

/** Build a SQLite client (local `bun:sqlite`). */
export function createSqliteClient(url: string): SqliteDb {
	const c = new Database(url);
	c.exec("PRAGMA journal_mode = WAL;");
	c.exec("PRAGMA foreign_keys = ON;");
	c.exec("PRAGMA busy_timeout = 5000;");
	return drizzle(c, { schema: sqliteSchema.schema });
}

/** Build a Postgres client (`postgres-js`). */
export function createPostgresClient(url: string, poolSize: number): PostgresDb {
	const c = postgres(url, { max: poolSize, prepare: false });
	return pgDrizzle(c, { schema: pgSchema.schema });
}

/** Build a Turso client (`@libsql/client`, local or cloud). */
export function createTursoClient(opts: {
	url: string;
	authToken?: string;
}): TursoDb {
	const c = createLibsqlClient({
		url: opts.url,
		...(opts.authToken ? { authToken: opts.authToken } : {}),
	});
	return libDrizzle(c, { schema: sqliteSchema.schema });
}

/**
 * Build a Neon client for the Worker, from Hyperdrive's runtime connection
 * string. Hyperdrive already pools connections, so `max: 1` avoids over-connecting.
 */
export function createNeonHyperdriveClient(connectionString: string): PostgresDb {
	const c = postgres(connectionString, { max: 1 });
	return pgDrizzle(c, { schema: pgSchema.schema });
}

/**
 * Build a Turso client for the Worker. Uses the HTTP build (`@libsql/client/http`)
 * pointed at Turso's HTTPS endpoint; `libsql://` URLs are rewritten to `https://`.
 */
export function createTursoWorkerClient(url: string, authToken: string): TursoWorkerDb {
	const httpUrl = url.replace(/^libsql:\/\//, "https://");
	const c = createLibsqlHttpClient({ url: httpUrl, authToken });
	return libDrizzle(c, { schema: sqliteSchema.schema });
}

/** Build a Cloudflare D1 client from the Worker's `D1Database` binding. */
export function createD1Client(d1: D1Database): D1Db {
	return d1Drizzle(d1, { schema: sqliteSchema });
}

// ─── Unified client (local / CLI, from .env) ─────────────────────────────────

/** Load the local dev env (`.env.dev.<type>`) into `process.env`. */
function loadDevEnvIntoProcess(): void {
	const devFile = devEnvFile();
	const vars = loadEnvFile(devFile);
	for (const [k, v] of Object.entries(vars)) {
		process.env[k] = v;
	}
}

/**
 * Create a Drizzle client for the active dialect, choosing the local dev client
 * (dev) or the remote client (production) from the environment. Only the active
 * dialect's driver is loaded (dynamic `import()` → tree-shaken).
 */
async function createClient(): Promise<DbClient> {
	// Development auto-loads the matching local dev env; production uses `.env`.
	if (process.env["NODE_ENV"] === "development") {
		loadDevEnvIntoProcess();
	}

	const dialect = dbDialect();

	switch (dialect) {
		case "turso": {
			const url =
				process.env["TURSO_URL"] ??
				process.env["TURSO_DB_URL"] ??
				`file:///${process.cwd()}/tursodb.db`;
			const authToken =
				process.env["TURSO_AUTH_TOKEN"] ?? process.env["TURSO_TOKEN"];
			const db = createTursoClient({ url, authToken });
			const handle = (db as { $client?: { close?: () => void | Promise<void> } })
				.$client;
			return {
				db,
				close: async () => {
					if (handle?.close) await handle.close();
				},
			};
		}
		case "neon":
		case "postgres": {
			const url =
				process.env["DATABASE_URL"] ??
				process.env["DATABASE_URL_UNPOOLED"] ??
				"postgres://postgres:postgres@localhost:5432/mydb";
			const rawPool = Number(process.env["DATABASE_POOL_SIZE"] ?? 10);
			const poolSize = Number.isFinite(rawPool) && rawPool > 0 ? rawPool : 10;
			const db = createPostgresClient(url, poolSize);
			const handle = (db as { $client?: { end?: () => Promise<void> } })
				.$client;
			return {
				db,
				close: async () => {
					if (handle?.end) await handle.end();
				},
			};
		}
		case "sqlite":
		case "d1":
		default: {
			// sqlite (and d1 without a binding — local dev) use the local sqlite client.
			const db = createSqliteClient(process.env["DATABASE_URL"] ?? "sqlite.db");
			return { db, close: async () => {} };
		}
	}
}

/** The pre-built client for the active dialect (use directly; no factory). */
export const client = await createClient();

/**
 * A concrete SQLite client for SQLite-specific consumers (the local repo, seed,
 * and tests). Always targets the local `sqlite.db` file regardless of the active
 * dialect's `DATABASE_URL`.
 */
export const sqliteDb = createSqliteClient("sqlite.db");
