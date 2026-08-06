/**
 * SQLite Drizzle client.
 *
 * This is the only module that touches `bun:sqlite`. Keeping it isolated means
 * the rest of the app (and the Cloudflare Worker entry) never statically
 * imports the Bun-only driver.
 */

import { Database } from "bun:sqlite";
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import * as sqliteSchema from "./schema/sqlite";

export type SqliteDb = BunSQLiteDatabase<typeof sqliteSchema.schema>;

export function createSqliteClient(url: string): SqliteDb {
	const client = new Database(url);
	client.exec("PRAGMA journal_mode = WAL;");
	client.exec("PRAGMA foreign_keys = ON;");
	client.exec("PRAGMA busy_timeout = 5000;");
	return drizzle(client, { schema: sqliteSchema.schema });
}

/** Create the SQLite client from env (used by the build-time repo factory). */
export function createClientFromEnv(): SqliteDb {
	return createSqliteClient(process.env["DATABASE_URL"] ?? "sqlite.db");
}
