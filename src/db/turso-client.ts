/**
 * Turso (libSQL) client for both local and cloud deployments.
 *
 * Turso is a SQLite-compatible edge database, so it reuses the SQLite schema
 * (`src/db/schema/sqlite.ts`) and the `movies` repo surface. The only difference
 * is the connection:
 *
 * The unified `DATABASE_TYPE=turso` covers both; `TURSO_URL` decides:
 *   - local:   `TURSO_URL=file:tursodb.db` (relative, single-colon file mode)
 *   - cloud:   `TURSO_URL=libsql://...` + `TURSO_AUTH_TOKEN=...`
 *
 * Uses `@libsql/client` via `drizzle-orm/libsql`.
 */

import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as sqliteSchema from "./schema/sqlite";

export type TursoDb = LibSQLDatabase<typeof sqliteSchema.schema>;

export interface TursoClientOptions {
	/** `file://./local.db` (local) or `libsql://...` (cloud). */
	url: string;
	/** Required for cloud (`turso`), optional for local. */
	authToken?: string;
}

export function createTursoClient(opts: TursoClientOptions): TursoDb {
	const client = createClient({
		url: opts.url,
		...(opts.authToken ? { authToken: opts.authToken } : {}),
	});
	return drizzle(client, { schema: sqliteSchema.schema });
}

/** Create the Turso client from env (used by the build-time repo factory). */
export function createClientFromEnv(): TursoDb {
	const url =
		process.env["TURSO_URL"] ??
		process.env["TURSO_DB_URL"] ??
		"file:tursodb.db"; // single-colon relative form; `file://tursodb.db` is an invalid host
	const authToken = process.env["TURSO_AUTH_TOKEN"] ?? process.env["TURSO_TOKEN"];
	return createTursoClient({ url, authToken });
}
