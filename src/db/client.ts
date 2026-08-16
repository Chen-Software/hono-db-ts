/**
 * db/client — build the request-path Drizzle database from a `DatabaseTarget`.
 *
 * The service layer (`src/services/*`) and the query capacities
 * (`servable`, `aggregable`) only ever talk to a Drizzle SQLite database
 * through the `Db` interface in `src/services/types` — they never touch a raw
 * `sql.unsafe`. This module is the single place that turns a
 * `DatabaseTarget` (resolved from `DATABASE_URL`) into that `Db`.
 *
 * ## Why `drizzle-orm/libsql` and not `drizzle-orm/bun-sql`
 *
 * `drizzle-orm/bun-sql` (the default `drizzle()` export) wraps a Bun `SQL`
 * client in the **Postgres** driver (`BunSQLDatabase extends PgDatabase`),
 * which has no `.all` / `.run` / `.get` raw methods — so the service layer's
 * `all` / `run` helpers throw `db.all is not a function`. The SQLite variant
 * (`drizzle-orm/bun-sql/sqlite`) exists, but in this drizzle version it fails
 * to bind the passed client to its session (the session ends up bound to a
 * different, empty database → `no such table`). `drizzle-orm/libsql` is the
 * stable, first-class SQLite driver: it binds the client correctly, exposes
 * `all` / `run` / `get` / `select`, keeps `?` placeholders, and opens the very
 * same `file:` / `:memory:` / libsql database the bootstrap layer seeds — so
 * tables created at startup (via `ensureSchema`) are visible to queries.
 *
 * ## One client, two jobs
 *
 * A single libSQL `Client` backs BOTH the bootstrap layer (through the
 * `libsqlUnsafeAdapter`, which satisfies `SqlQueryExecutor.unsafe` so
 * `ensureSchema` / `hasSchema` run unchanged) and the request path (through
 * `drizzle({ client })`). That means:
 *   - no second connection pool contending on the same file,
 *   - `:memory:` works (one shared in-memory database, not two separate ones),
 *   - the schema seeded at startup is exactly what queries see.
 *
 * For the Cloudflare Worker the D1 database comes from a binding, not a URL;
 * `src/worker/*` wraps it with `drizzle-orm/d1` directly (see `app/server.cf.ts`).
 */

import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { DatabaseTarget } from "@/http/schema";
import type { Db } from "@/services/types";
import type { SqlQueryExecutor } from "@/capacities/servable";

/** Normalise a `DatabaseTarget` into a libSQL connection URL. */
export function toLibsqlUrl(target: DatabaseTarget): string {
	if (target.kind === "memory") return ":memory:";
	const u = target.url;
	if (/^(file:|libsql:|https?:)/.test(u)) return u;
	// Bare path → `file:` URL (relative paths stay relative to cwd).
	return u.startsWith("/") ? `file:${u}` : `file:./${u}`;
}

/** Create the libSQL client for a target (file / memory / turso). */
export function createLibsqlClient(target: DatabaseTarget): Client {
	return createClient({ url: toLibsqlUrl(target) });
}

/**
 * Adapt a libSQL `Client` to the `SqlQueryExecutor` interface (`unsafe`) so the
 * bootstrap layer (`ensureSchema`, `hasSchema`) can run DDL/DQL against it
 * without knowing about libSQL. SELECTs surface their `rows` so callers that
 * read `rows.length` (e.g. `hasSchema`) keep working.
 */
export function libsqlUnsafeAdapter(client: Client): SqlQueryExecutor {
	return {
		async unsafe(sql: string, params?: unknown[]): Promise<unknown[]> {
			const res = await client.execute({ sql, args: params ?? [] });
			const rows = (res as unknown as { rows?: unknown[] }).rows;
			return (rows ?? (res as unknown[])) as unknown[];
		},
	};
}

/**
 * Build the Drizzle database the service layer talks to, from a target.
 *
 * Bootstraps the schema on the SAME libSQL client (via `libsqlUnsafeAdapter`)
 * before any query runs, so the request path sees the tables. Returns `null`
 * when there's no target (e.g. an empty `DATABASE_URL`).
 */
export async function createQueryDb(target: DatabaseTarget | null): Promise<Db | null> {
	if (!target) return null;
	const client = createLibsqlClient(target);
	const { ensureSchema } = await import("@/http/schema");
	const created = await ensureSchema(libsqlUnsafeAdapter(client));
	if (created) {
		console.log(
			`[db] ${target.kind} target had no schema — applied drizzle/*.sql (zero-setup).`,
		);
	}
	const db = drizzle({ client }) as Db;
	return db;
}
