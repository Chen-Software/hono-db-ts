/**
 * worker — Cloudflare Workers entry for the BBS query service.
 *
 * Deploys the SAME Hono app as the local server (`scripts/serve.ts`) but as a
 * Worker: `export default { fetch }` is the platform handler Wrangler bundles.
 *
 * The database backend is selected at BUILD time by the `DATABASE_TYPE` macro
 * (dead-code eliminated — the unselected branch never ships):
 *
 *   - `DATABASE_TYPE=d1` (production) — DURABLE Cloudflare D1 database reached
 *     through the `env.DB` binding. D1 is permanent, replicated edge SQLite:
 *     it survives isolate eviction and is shared across requests (unlike a
 *     local file, which Workers cannot write persistently). Schema/migrations
 *     are applied out-of-band via `wrangler d1 migrations apply` (from
 *     `drizzle/`); the worker never runs DDL at startup.
 *   - `DATABASE_TYPE=sqlite` (local dev) — in-memory `bun:sqlite`; the worker
 *     applies the bundled migration SQL (inlined from `drizzle/*.sql` by
 *     `scripts/cf-build.ts`) at startup. This is NON-durable and only for
 *     local `wrangler dev` — never for a real deployment.
 *
 * NOTE on "permanent files": Cloudflare Workers have no writable local
 * filesystem, so a file-based sqlite database is not a valid production
 * target. For durable production storage use D1 (this file, `env.DB`) or Turso
 * (`libsql://…`, `DATABASE_TYPE=turso`).
 *
 * Build: `bun run scripts/cf-build.ts` (or `bun run cf:build`).
 */

import { SQL } from "bun";
import { Hono } from "hono";

import { isD1 } from "@/macros/envs" with { type: "macro" };
import type { SqlQueryExecutor } from "@/capacities/servable";
import { buildQueryApp } from "@/http/app";

/** Worker bindings — the D1 database is `env.DB`. */
export interface WorkerEnv {
	DB?: D1Database;
}

/**
 * Generated migration SQL, inlined at build time by `scripts/cf-build.ts`
 * (replaced with the concatenated `drizzle/*.sql` contents). Only used by the
 * local sqlite branch.
 */
declare const __MIGRATIONS_SQL__: string;

/** Split a migration's SQL into individual statements (same as db-migrate). */
function splitStatements(sql: string): string[] {
	return sql
		.replace(/--.*$/gm, "")
		.split(";")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

/**
 * Adapter turning the Workers D1 binding into the `SqlQueryExecutor` shape the
 * Hono app reads through (`unsafe(sql, params)` → rows). D1 runs SQLite
 * dialect, so the same SQL the app emits works unchanged.
 */
class D1Executor implements SqlQueryExecutor {
	constructor(private readonly db: D1Database) {}

	unsafe(sql: string, params: unknown[] = []): Promise<unknown[]> {
		const stmt = this.db.prepare(sql);
		const bound = params.length > 0 ? stmt.bind(...params) : stmt;
		return bound.all().then((res) => res.results);
	}
}

/** Create the query app bound to the build-selected database backend. */
function init(env: WorkerEnv): Hono {
	if (isD1()) {
		// Durable D1 — via the env.DB binding. No startup DDL (migrations are
		// applied out-of-band); `bun:sqlite` is dead-code-eliminated here.
		if (!env.DB) {
			throw new Error("worker: DATABASE_TYPE=d1 but env.DB binding is missing");
		}
		return buildQueryApp(new D1Executor(env.DB));
	}

	// Local sqlite — in-memory, schema from the bundled migrations. This
	// branch (and the `bun:sqlite` import) is dropped when built for d1.
	const client = new SQL(":memory:");
	for (const stmt of splitStatements(__MIGRATIONS_SQL__)) {
		client.unsafe(stmt);
	}
	return buildQueryApp(client);
}

export default {
	async fetch(request: Request, env: WorkerEnv): Promise<Response> {
		const app = init(env);
		return app.fetch(request);
	},
};
