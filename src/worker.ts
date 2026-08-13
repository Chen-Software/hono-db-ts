/**
 * worker — Cloudflare Workers entry for the BBS query service.
 *
 * Deploys the SAME Hono app as the local server (`scripts/serve.ts`) but as a
 * Worker: `export default { fetch }` is the platform handler Wrangler bundles.
 *
 * Database: production is configured as in-memory sqlite (`DATABASE_TYPE=sqlite`
 * + `DATABASE_URL=:memory:`). Because the DB is in-memory, the worker creates
 * its schema at startup — it applies the SAME generated migration SQL the
 * `db:migrate` pipeline uses (bundled from `drizzle/*.sql` at build time) to a
 * fresh `new SQL(":memory:")` client. Each isolate gets its own in-memory DB;
 * there is no cross-request persistence by design.
 *
 *   - local dev / `wrangler dev`  → runs under Bun, `bun:sqlite` available.
 *   - `wrangler deploy`           → bundles with `bun:sqlite`; for a durable
 *     edge database switch the configured backend to D1 (`DATABASE_TYPE=d1`,
 *     `env.DB` binding) — the app and routes are unchanged.
 *
 * Build: `bun run scripts/cf-build.ts` (or `bun run cf:build`). The migration
 * SQL is inlined as a string literal by the build script, so this module has no
 * filesystem dependency at runtime.
 */

import { SQL } from "bun";

import { buildQueryApp } from "@/http/app";

/**
 * Generated migration SQL, inlined at build time by `scripts/cf-build.ts`
 * (replaced with the concatenated `drizzle/*.sql` contents).
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

// Module-scoped, lazily initialised once per isolate.
let db: SQL | undefined;
let app: ReturnType<typeof buildQueryApp> | undefined;

function init(): { db: SQL; app: ReturnType<typeof buildQueryApp> } {
	if (db && app) return { db, app };
	const client = new SQL(":memory:");
	for (const stmt of splitStatements(__MIGRATIONS_SQL__)) {
		client.unsafe(stmt);
	}
	db = client;
	app = buildQueryApp(client);
	return { db, app };
}

export default {
	async fetch(request: Request): Promise<Response> {
		const { app: queryApp } = init();
		return queryApp.fetch(request);
	},
};
