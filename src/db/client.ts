/**
 * Unified Drizzle client factory — auto-selects remote vs local dev based on
 * `NODE_ENV`, and loads **only the active dialect's driver** via dynamic
 * `import()` so unused clients are tree-shaken out of the bundle.
 *
 * This is a **runtime** module: a Bun macro cannot return a client object
 * (macros only inline literals). `dbDialect()` is a build-time macro that
 * inlines the dialect literal; the `switch` below then resolves, and the
 * matching `import(<literal>)` is statically analyzed by the bundler, so only
 * the selected driver ships (no `postgres`, `bun:sqlite`, `drizzle-orm/d1`, or
 * `@libsql/client` unless the active dialect needs it).
 *
 * Selection:
 *   - `NODE_ENV=development` (or `db:seed --dev`) → loads the matching
 *     `.env.dev.<type>` via the `src/macros/dev-env.ts` macro, then creates the
 *     **local** dev client (e.g. `file:tursodb.db`, `localhost:5432`, `sqlite.db`).
 *   - otherwise (production / CI) → creates the **remote** client from `.env`
 *     (Turso Cloud, Neon, or local-path defaults for a single-writer setup).
 *
 * Dialect handling:
 *   - `turso`            -> `@libsql/client` (`TURSO_URL` + `TURSO_AUTH_TOKEN`)
 *   - `neon` / `postgres`-> `postgres-js` (`DATABASE_URL` / `DATABASE_URL_UNPOOLED`)
 *   - `sqlite`           -> `bun:sqlite` (`DATABASE_URL`, default `sqlite.db`)
 *   - `d1`               -> with a binding (`createClient({ d1: env.DB })`) uses
 *     `drizzle-orm/d1` (remote-only, per
 *     https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1). Without a
 *     binding (local/CLI dev) it falls back to the local `bun:sqlite` client —
 *     D1 has no local-file driver, so SQLite is used for local development.
 */

import { dbDialect } from "../macros/db-dialect" with { type: "macro" };
import {
	devEnvFile,
	loadEnvFile,
} from "../macros/dev-env" with { type: "macro" };

export type DialectDb = import("./turso-client").TursoDb | import("./postgres-client").PostgresDb | import("./sqlite-client").SqliteDb | D1Db;

/** Drizzle client backed by a Cloudflare D1 binding (`drizzle-orm/d1`). */
export type D1Db = import("drizzle-orm/d1").DrizzleD1Database<
	typeof import("./schema")
>;

/** Options for `createClient()`. */
export interface CreateClientOptions {
	/** Required for `DATABASE_TYPE=d1`: the Worker D1 binding (e.g. `env.DB`). */
	d1?: D1Database;
}

/** A connected Drizzle client with a generic cleanup helper. */
export interface DbClient<TDb extends DialectDb = DialectDb> {
	/** The dialect-specific Drizzle client. */
	db: TDb;
	/** Close the underlying driver connection (async-safe; no-op for sqlite/D1). */
	close: () => Promise<void>;
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
 * Create a Drizzle client for the active dialect, automatically choosing the
 * local dev client (dev) or the remote client (production) from the environment.
 * Only the active dialect's driver is loaded (dynamic `import()` → tree-shaken).
 * For `d1`, pass the Worker binding via `options.d1` (e.g. `env.DB`).
 */
export async function createClient<TDb extends DialectDb = DialectDb>(
	options: CreateClientOptions = {},
): Promise<DbClient<TDb>> {
	// Development auto-loads the matching local dev env; production uses `.env`.
	if (process.env["NODE_ENV"] === "development") {
		loadDevEnvIntoProcess();
	}

	const dialect = dbDialect();

	switch (dialect) {
		case "turso":
		case "tursodb":
		case "turso-cloud": {
			const { createTursoClient } = await import("./turso-client");
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
		case "postgres":
		case "postgresql":
		case "pg": {
			const { createPostgresClient } = await import("./postgres-client");
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
		case "sqlite": {
			const { createSqliteClient } = await import("./sqlite-client");
			const db = createSqliteClient(
				process.env["DATABASE_URL"] ?? "sqlite.db",
			);
			return { db, close: async () => {} };
		}
		case "d1": {
			// `drizzle-orm/d1` is REMOTE-only (needs a `D1Database` Worker binding
			// — see https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1).
			// It has no local-file support, so for local/CLI dev we fall back to
			// the local `bun:sqlite` client (same SQLite schema module). The
			// `D1Database` binding path is used only inside a Cloudflare Worker.
			if (options.d1) {
				const { drizzle } = await import("drizzle-orm/d1");
				const schema = await import("./schema");
				const db = drizzle(options.d1, { schema });
				return { db, close: async () => {} }; // D1 has no connection to close
			}
			// No binding → local SQLite file for development / CLI.
			const { createSqliteClient } = await import("./sqlite-client");
			const db = createSqliteClient(
				process.env["DATABASE_URL"] ?? "sqlite.db",
			);
			return { db, close: async () => {} };
		}
		default:
			throw new Error(`Unknown DATABASE_TYPE: ${dialect}`);
	}
}
