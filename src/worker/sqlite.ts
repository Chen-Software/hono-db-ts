/**
 * worker/sqlite — LOCAL in-memory sqlite backend (`bun:sqlite`).
 *
 * NON-durable: the database lives only for the lifetime of the isolate and is
 * for LOCAL `wrangler dev` / development only — never a real deployment. It
 * applies the bundled migration SQL (inlined from `drizzle/*.sql` by
 * `scripts/cf-build.ts`) at startup.
 *
 * This module imports `bun:sqlite`, so it is only included when the build
 * targets sqlite (the d1 build never loads this file — see `src/worker.ts`).
 */

import { SQL } from "bun";

import { buildQueryApp } from "@/http/app";
import type { WorkerBackend, WorkerEnv } from "./types";

/**
 * Generated migration SQL, inlined at build time by `scripts/cf-build.ts`.
 * Only referenced by this (sqlite) backend.
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

export const backend: WorkerBackend = {
	async init(_env: WorkerEnv) {
		const client = new SQL(":memory:");
		// Bun's SQL.unsafe() is ASYNC — await each statement so the DDL
		// completes before the first query races ahead of it.
		for (const stmt of splitStatements(__MIGRATIONS_SQL__)) {
			await client.unsafe(stmt);
		}
		return buildQueryApp(client);
	},
};
