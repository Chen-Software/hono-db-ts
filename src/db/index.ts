/**
 * Dialect factory + lazy singleton.
 *
 * Reads `DATABASE_TYPE` (`sqlite` | `postgres`) and returns a working Drizzle
 * instance for that dialect. Both dialects expose the same `movies` surface,
 * so application code never imports dialect modules directly.
 */

import { Database } from "bun:sqlite";
import {
	type BunSQLiteDatabase,
	drizzle as drizzleSqlite,
} from "drizzle-orm/bun-sqlite";
import {
	drizzle as drizzlePostgres,
	type PostgresJsDatabase,
} from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as pgSchema from "./schema/postgres";
import * as sqliteSchema from "./schema/sqlite";

const DEFAULT_SQLITE_URL = "sqlite.db";
const DEFAULT_PG_URL = "postgres://postgres:postgres@localhost:5432/mydb";

let instance: Db | undefined;

function createSqliteClient(
	url: string,
): BunSQLiteDatabase<typeof sqliteSchema.schema> {
	const client = new Database(url);
	client.exec("PRAGMA journal_mode = WAL;");
	client.exec("PRAGMA foreign_keys = ON;");
	client.exec("PRAGMA busy_timeout = 5000;");
	return drizzleSqlite(client, { schema: sqliteSchema.schema });
}

function getDb(): Db {
	if (instance) return instance;
	instance = createDb(resolveDialect(), resolveUrl());
	return instance;
}

function resolveDialect(): DbDialect {
	const type = (process.env["DATABASE_TYPE"] ?? "sqlite").toLowerCase();
	if (type === "postgres" || type === "postgresql" || type === "pg")
		return "postgres";
	if (type === "sqlite") return "sqlite";
	throw new Error(
		`Unknown DATABASE_TYPE "${type}" — expected "sqlite" or "postgres"`,
	);
}

function resolveUrl(): string {
	if (process.env["DATABASE_URL"]) return process.env["DATABASE_URL"];
	return resolveDialect() === "postgres" ? DEFAULT_PG_URL : DEFAULT_SQLITE_URL;
}

function resolveSqliteUrl(): string {
	return process.env["DATABASE_URL"] ?? DEFAULT_SQLITE_URL;
}

function createDb(dialect: DbDialect, url: string): Db {
	if (dialect === "sqlite") return createSqliteClient(url);
	const client = postgres(url, {
		max: poolSize(),
		prepare: false,
	});
	return drizzlePostgres(client, { schema: pgSchema.schema });
}

function poolSize(): number {
	const raw = process.env["DATABASE_POOL_SIZE"];
	if (!raw) return 10;
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? n : 10;
}

function resetDb(): void {
	instance = undefined;
}

function isSqliteDb(
	db: Db,
): db is BunSQLiteDatabase<typeof sqliteSchema.schema> {
	const client = (db as { $client?: unknown }).$client;
	return (
		typeof client === "object" && client !== null && client instanceof Database
	);
}

function isPostgresDb(
	db: Db,
): db is PostgresJsDatabase<typeof pgSchema.schema> {
	return !isSqliteDb(db);
}

export type Db =
	| BunSQLiteDatabase<typeof sqliteSchema.schema>
	| PostgresJsDatabase<typeof pgSchema.schema>;

export type DbDialect = "sqlite" | "postgres";

/**
 * The shared Drizzle client for the active dialect.
 * Resolves `DATABASE_TYPE` / `DATABASE_URL` from the environment (see `.env.example`).
 */
export const db = getDb();

/**
 * A concrete SQLite client for SQLite-specific consumers (the local repo,
 * seed, and tests). Reads `DATABASE_URL` for the file path.
 */
export const sqliteDb = createSqliteClient(resolveSqliteUrl());

export { getDb, createDb, resetDb, resolveDialect, isSqliteDb, isPostgresDb };
