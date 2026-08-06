/**
 * Unified Drizzle client — auto-selects remote vs local dev based on `NODE_ENV`,
 * and loads **only the active dialect's driver** via dynamic `import()` so unused
 * clients are tree-shaken out of the bundle.
 *
 * This is a **runtime** module: a Bun macro cannot return a client object
 * (macros only inline literals). `dbDialect()` is a build-time macro that inlines
 * the dialect literal; the `switch` below then resolves, and the matching
 * `import(<literal>)` is statically analyzed by the bundler, so only the selected
 * driver ships.
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
 *   - `d1`               -> local/CLI falls back to the local `bun:sqlite` client
 *     (D1 has no local driver; the Worker builds its D1 client from the binding
 *     via `src/db/d1-client.ts` `createD1Client(env.DB)`).
 */

import { dbDialect } from "../macros/db-dialect" with { type: "macro" };
import {
	devEnvFile,
	loadEnvFile,
} from "../macros/dev-env" with { type: "macro" };
import type { PostgresDb } from "./postgres-client";
import type { SqliteDb } from "./sqlite-client";
import type { TursoDb } from "./turso-client";

export type DialectDb = TursoDb | PostgresDb | SqliteDb;

/** A connected Drizzle client with a generic cleanup helper. */
export interface DbClient<TDb extends DialectDb = DialectDb> {
	/** The dialect-specific Drizzle client. */
	db: TDb;
	/** Close the underlying driver connection (async-safe; no-op for sqlite). */
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
		case "postgres": {
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
		case "sqlite":
		case "d1":
		default: {
			// sqlite (and d1 without a binding — local dev) use the local sqlite client.
			const { createSqliteClient } = await import("./sqlite-client");
			const db = createSqliteClient(
				process.env["DATABASE_URL"] ?? "sqlite.db",
			);
			return { db, close: async () => {} };
		}
	}
}

/** The pre-built client for the active dialect (use directly; no factory). */
export const client = await createClient();
