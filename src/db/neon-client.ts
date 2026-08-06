/**
 * Neon (serverless Postgres) client for the Cloudflare Worker.
 *
 * Hyperdrive provides an optimized TCP connection pool to the Neon database.
 * Per Neon's guidance, Hyperdrive must be used with a standard TCP Postgres
 * driver (`postgres-js`), **not** the WebSocket/HTTP-based Neon Serverless
 * driver. The `nodejs_compat` flag (see `wrangler.jsonc`) provides the
 * `node:net`/`node:tls` support `postgres-js` needs inside the Worker.
 *
 * Only imported by `src/worker.ts` — never by the local Bun entry.
 */

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as pgSchema from "./schema/postgres";

export type NeonDb = PostgresJsDatabase<typeof pgSchema.schema>;

export function createNeonHyperdriveClient(connectionString: string): NeonDb {
	// Hyperdrive already pools connections, so max: 1 avoids over-connecting.
	const client = postgres(connectionString, { max: 1 });
	return drizzle(client, { schema: pgSchema.schema });
}
