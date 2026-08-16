/**
 * test-db — shared SQL-route test harness.
 *
 * Capacity SQL routes (`Servable.serve`, `Aggregable.serveAggregate`) talk to
 * the SAME `Db` interface the production service layer uses: a Drizzle SQLite
 * database (`drizzle-orm/libsql` → `drizzle({ client })`) backed by a libSQL
 * `Client`. That `Db` exposes `.all` / `.run` / `.get` — the shape the
 * `all` / `run` helpers in `src/services/types` require.
 *
 * The old capacity tests passed a raw `bun:sqlite` `SQL` proxy (`.unsafe`-only,
 * no `.all`), which made every SQL route throw `db.all is not a function`. This
 * helper reproduces the production wiring so the routes are exercised against
 * the exact Drizzle path they run in `app/server.ts` / `scripts/serve.ts`.
 */
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { Db } from "@/services/types";

/** Split a multi-statement SQL string into individual statements. */
function splitStatements(sql: string): string[] {
	const out: string[] = [];
	let cur = "";
	let inStr = false;
	for (let i = 0; i < sql.length; i++) {
		const ch = sql[i];
		if (ch === "'") {
			// libSQL/SQLite escapes a single quote by doubling it.
			if (inStr && sql[i + 1] === "'") {
				cur += "''";
				i++;
				continue;
			}
			inStr = !inStr;
			cur += ch;
		} else if (ch === ";" && !inStr) {
			if (cur.trim()) out.push(cur.trim());
			cur = "";
		} else {
			cur += ch;
		}
	}
	if (cur.trim()) out.push(cur.trim());
	return out;
}

export interface TestDb {
	/** Drizzle SQLite database handed to `serve` / `serveAggregate`. */
	db: Db;
	/** Close the underlying libSQL client. */
	close: () => Promise<void>;
}

/**
 * Build an in-memory libSQL-backed Drizzle `Db`, seed it with `ddl` + `seed`,
 * and return it for the capacity routes under test.
 */
export async function makeTestDb(ddl: string, seed: string): Promise<TestDb> {
	const client: Client = createClient({ url: ":memory:" });
	for (const stmt of splitStatements(ddl)) await client.execute(stmt);
	for (const stmt of splitStatements(seed)) await client.execute(stmt);
	const db = drizzle({ client }) as Db;
	return { db, close: () => client.close() };
}
