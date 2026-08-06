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
