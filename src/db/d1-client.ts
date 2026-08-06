/**
 * Cloudflare D1 Drizzle client.
 *
 * Per https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1, a D1 client is
 * created from a `D1Database` binding (remote-only — D1 has no local-file driver).
 * Extract it here so `src/db/client.ts` stays a thin dialect dispatcher.
 *
 * Local / CLI dev has no binding, so D1 falls back to the local `bun:sqlite`
 * client (see `src/db/sqlite-client.ts`) in `src/db/client.ts`.
 */

import { drizzle } from "drizzle-orm/d1";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

/** Drizzle client backed by a Cloudflare D1 binding. */
export type D1Db = DrizzleD1Database<typeof schema>;

/** Build a D1 Drizzle client from a Worker `D1Database` binding. */
export function createD1Client(d1: D1Database): D1Db {
	return drizzle(d1, { schema });
}
