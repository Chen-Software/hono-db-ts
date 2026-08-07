/**
 * Unified Drizzle client — single source for every dialect's client.
 *
 * Everything about building a Drizzle client lives here: the shared `client`
 * singleton (from `.env` / `NODE_ENV`) AND the factory functions the Worker and
 * tests use to build client-specific instances from their own connection inputs.
 *
 * This module is a **runtime** module: a Bun macro cannot return a client object
 * (macros only inline literals). `dbDialect()` is a build-time macro that inlines
 * the dialect literal.
 *
 * Tree-shaking: every driver (`bun:sqlite`, `postgres`, `@libsql/client`,
 * `@libsql/client/http`, `drizzle-orm/d1`) is loaded via **dynamic `import()`**
 * inside the factory / `createClient()` switch. The bundler then resolves only
 * the literal specifier on the active dialect's branch and drops the rest, so a
 * neon Worker ships only the `postgres` driver, a turso Worker only libsql, etc.
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

import { dialect } from "../macros/db" with { type: "macro" };
import { devEnvFile, loadEnvFile } from "../macros/dev-env" with {
	type: "macro",
};

// ─── Types ───────────────────────────────────────────────────────────────────

// Type-only imports (erased at runtime) — they do NOT pull the drivers in.
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { schemas } from "./schema";
import type { ProcessEnv } from "bun";

const schema = schemas.schema;

/** SQLite-family Drizzle client. */
export type SqliteDb = BunSQLiteDatabase<typeof sqliteSchema>;
/** Postgres / Neon Drizzle client. */
export type PostgresDb = PostgresJsDatabase<typeof pgSchema>;
/** Turso (libSQL) Drizzle client. */
export type TursoDb = LibSQLDatabase<typeof sqliteSchema>;
/** Turso HTTP (Worker) Drizzle client. */
export type TursoWorkerDb = LibSQLDatabase<typeof sqliteSchema>;
/** Cloudflare D1 Drizzle client. */
export type D1Db = DrizzleD1Database<typeof sqliteSchema>;
/** Neon Hyperdrive Drizzle client. */
export type NeonDb = PostgresJsDatabase<typeof pgSchema>;
/** The union of all dialect Drizzle clients `createClient()` can return. */
export type DialectDb = SqliteDb | D1Db | TursoDb | PostgresDb | NeonDb;

/** A connected Drizzle client with a generic cleanup helper. */
export interface DbClient<TDb extends DialectDb = DialectDb> {
	/** The dialect-specific Drizzle client. */
	db: TDb;
	/** Close the underlying driver connection (async-safe; no-op for sqlite). */
	close: () => Promise<void>;
}

// ─── Unified client (local / CLI, from .env) ─────────────────────────────────

/** Resolve the Postgres pool size from `DATABASE_POOL_SIZE` (default 10). */
function poolSize(): number {
	const raw = Number(process.env["DATABASE_POOL_SIZE"] ?? 10);
	return Number.isFinite(raw) && raw > 0 ? raw : 10;
}

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
/**
 * A Bun/Node `process.env`-style object (string keys) — e.g. `process.env`, a
 * `.env` object, or the string bindings on a Worker env.
 */
type ClientEnv = ProcessEnv | CloudflareBindings;

export async function createClient(
	env: ClientEnv = process.env,
): Promise<DbClient> {
	// Development auto-loads the matching local dev env; production uses `.env`.
	const isDev = env["NODE_ENV"] === "development";
	if (isDev) {
		loadDevEnvIntoProcess();
	}

	switch (dialect()) {
		case "turso": {
			const [{ createClient: createLibsqlClient }, { drizzle }] =
				await Promise.all([
					import("@libsql/client"),
					import("drizzle-orm/libsql"),
				]);

			const url =
				env["TURSO_URL"] ??
				env["TURSO_DB_URL"] ??
				`file:///${process.cwd()}/tursodb.db`;
			const authToken = env["TURSO_AUTH_TOKEN"] ?? env["TURSO_TOKEN"];
			const c = createLibsqlClient({ url, authToken });
			const db = drizzle(c, { schema }) as TursoWorkerDb;
			const handle = (
				db as { $client?: { close?: () => void | Promise<void> } }
			).$client;
			return {
				db,
				close: async () => {
					if (handle?.close) await handle.close();
				},
			};
		}
		case "neon": {
			// Neon uses Hyperdrive (the Worker binding) when available, falling
			// back to a plain `DATABASE_URL` for local/CLI runs.
			const hyperdrive = env["HYPERDRIVE"] as unknown as
				| { connectionString?: string }
				| undefined;
			const url =
				hyperdrive?.connectionString ?? process.env["DATABASE_URL"] ?? "";
			const [{ default: postgres }, { neon }, { drizzle }] =
				await Promise.all([
					import("postgres"),
					import("@neondatabase/serverless"),
					import("drizzle-orm/postgres-js"),
				]);
			if (isDev) {
				const c = postgres(url, { max: 1 });
				const db = drizzle(c, { schema }) as PostgresDb;
				const handle = (
					db as { $client?: { end?: () => Promise<void> } }
				).$client;
				return {
					db,
					close: async () => {
						if (handle?.end) await handle.end();
					},
				};
			}
			// Worker / prod: Neon's HTTP driver works inside Cloudflare Workers
			// (postgres-js's TCP connection does not). Prefer the Hyperdrive
			// connection string when the binding is present.
			const { drizzle: neonDrizzle } = await import("drizzle-orm/neon-http");
			const sql = neon(hyperdrive?.connectionString ?? env["DATABASE_URL"]!);
			const db = neonDrizzle(sql, { schema }) as unknown as NeonDb;
			return { db, close: async () => {} };
		}
		case "postgres": {
			const [{ default: postgres }, { drizzle }] = await Promise.all([
				import("postgres"),
				import("drizzle-orm/postgres-js"),
			]);
			const url =
				process.env["DATABASE_URL"] ??
				process.env["DATABASE_URL_UNPOOLED"] ??
				"postgres://postgres:postgres@localhost:5432/mydb";
			const c = postgres(url, { max: poolSize(), prepare: false });
			const db = drizzle(c, { schema }) as PostgresDb;

			const handle = (db as { $client?: { end?: () => Promise<void> } })
				.$client;
			return {
				db,
				close: async () => {
					if (handle?.end) await handle.end();
				},
			};
		}
		case "d1": {
			const { drizzle } = await import("drizzle-orm/d1");
			const db = drizzle(env.DB, { schema }) as D1Db;
			return { db, close: async () => {} };
		}
		case "sqlite":
		default: {
			const [{ Database }, { drizzle }] = await Promise.all([
				import("bun:sqlite"),
				import("drizzle-orm/bun-sqlite"),
			]);
			const url = env["DATABASE_URL"] ?? "sqlite.db";
			const c = new Database(url);
			c.exec("PRAGMA journal_mode = WAL;");
			c.exec("PRAGMA foreign_keys = ON;");
			c.exec("PRAGMA busy_timeout = 5000;");
			const db = drizzle(c, { schema }) as SqliteDb;
			return { db, close: async () => {} };
		}
	}
}

/** The pre-built client for the active dialect (use directly; no factory). */
export const client = await createClient();
