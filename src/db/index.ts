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

import { resolve } from "node:path";
import { isPg, dialect } from "../macros/db" with { type: "macro" };
import type { DbDialect } from "../macros/db";
import { client, createClient, type DbClient, type DialectDb } from "./client";

const DEFAULT_SQLITE_URL = "sqlite.db";
const DEFAULT_PG_URL = "postgres://postgres:postgres@localhost:5432/mydb";
// libSQL `file:` URLs need an absolute path for the `file:///` form (two `//`
// plus the path). Compute it from the project root so it works anywhere.
const DEFAULT_SQLITE_LOCAL_URL = `file:///${resolve(process.cwd(), "sqlite.db")}`;

let instance: Db | undefined;
const d: DbDialect = dialect();
const isPostgres = isPg();

/**
 * The connection URL, resolved at build time by the macro.
 * Falls back to the dialect-appropriate default when `DATABASE_URL` is unset.
 */
function resolveUrl(): string {
	const url =
		process.env["DATABASE_URL"] ??
		process.env["TURSO_URL"] ??
		process.env["TURSO_DB_URL"];
	if (url) return url;
	if (d === "postgres" || d === "neon") return DEFAULT_PG_URL;
	if (d === "turso" || d === "sqlite") return DEFAULT_SQLITE_LOCAL_URL;
	return DEFAULT_SQLITE_URL;
}

// The SQLite client is always the local `sqlite.db` file — it must NOT read the
// shared `DATABASE_URL`, which points at a Postgres/Neon server for other dialects.
function resolveSqliteUrl(): string {
	return DEFAULT_SQLITE_URL;
}

function poolSize(): number {
	const raw = process.env["DATABASE_POOL_SIZE"];
	if (!raw) return 10;
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? n : 10;
}

function getDb(): Db {
	return db;
}

async function resetDb(): Promise<void> {
	db = await createClient();
}

function isSqliteDb(): boolean {
	return !isPostgres;
}

function isPostgresDb(): boolean {
	return isPostgres;
}

export type Db = DbClient<DialectDb>;

export type { DbDialect };

/**
 * The shared Drizzle client for the active dialect.
 * The dialect is chosen at build time by `src/macros/db.ts`.
 */
export let db = client;

export { getDb, resetDb, dialect, isSqliteDb, isPostgresDb };
