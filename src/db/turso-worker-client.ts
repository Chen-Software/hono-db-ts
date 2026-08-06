/**
 * Turso client for the Cloudflare Worker.
 *
 * Workers cannot use the Node `@libsql/client` build, and the WebSocket-based
 * `@libsql/client/web` is unreliable in Workers (it can hang / error). The
 * recommended approach for Workers is the HTTP build (`@libsql/client/http`)
 * pointed at Turso's HTTPS endpoint.
 *
 * Turso exposes the same database over HTTPS; the `libsql://` URL from the
 * console can be rewritten to `https://` for the HTTP client.
 *
 * Only imported by `src/worker.ts` — never by the local Bun entry.
 */

import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client/http";
import * as sqliteSchema from "./schema/sqlite";

export type TursoWorkerDb = LibSQLDatabase<typeof sqliteSchema.schema>;

/** Convert a `libsql://host` URL to the `https://host` form for the HTTP client. */
function toHttps(url: string): string {
	return url.replace(/^libsql:\/\//, "https://");
}

export function createTursoWorkerClient(
	url: string,
	authToken: string,
): TursoWorkerDb {
	const client = createClient({ url: toHttps(url), authToken });
	return drizzle(client, { schema: sqliteSchema.schema });
}
