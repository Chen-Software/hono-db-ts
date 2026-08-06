/**
 * Postgres Drizzle client.
 *
 * Isolated so the Cloudflare Worker bundle never imports the heavy
 * `postgres` driver unless the Postgres dialect is actually selected.
 */

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as pgSchema from "./schema/postgres";

export type PostgresDb = PostgresJsDatabase<typeof pgSchema.schema>;

export function createPostgresClient(
	url: string,
	poolSize: number,
): PostgresDb {
	const client = postgres(url, {
		max: poolSize,
		prepare: false,
	});
	return drizzle(client, { schema: pgSchema.schema });
}

/** Create the Postgres client from env (used by the build-time repo factory). */
export function createClientFromEnv(): PostgresDb {
	const url =
		process.env["DATABASE_URL"] ??
		"postgres://postgres:postgres@localhost:5432/mydb";
	const rawPool = Number(process.env["DATABASE_POOL_SIZE"] ?? 10);
	const poolSize = Number.isFinite(rawPool) && rawPool > 0 ? rawPool : 10;
	return createPostgresClient(url, poolSize);
}
