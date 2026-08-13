/**
 * worker/d1 — DURABLE Cloudflare D1 backend.
 *
 * D1 is permanent, replicated edge SQLite: it survives isolate eviction and is
 * shared across all requests (Cloudflare Workers have no writable local
 * filesystem, so a file-based database is NOT a valid production target).
 *
 * The worker reaches it through the `env.DB` binding; migrations are applied
 * out-of-band (`wrangler d1 migrations apply` from `drizzle/`), so this module
 * never runs DDL at startup. It contains no `bun:sqlite` import, so the d1
 * worker bundle is Workers-runtime clean.
 */

import { buildQueryApp } from "@/http/app";
import type { SqlQueryExecutor, WorkerBackend, WorkerEnv } from "./types";

/** Adapter turning the Workers D1 binding into the `SqlQueryExecutor` shape. */
class D1Executor implements SqlQueryExecutor {
	constructor(private readonly db: D1Database) {}

	unsafe(sql: string, params: unknown[] = []): Promise<unknown[]> {
		const stmt = this.db.prepare(sql);
		const bound = params.length > 0 ? stmt.bind(...params) : stmt;
		return bound.all().then((res) => res.results);
	}
}

export const backend: WorkerBackend = {
	init(env: WorkerEnv) {
		if (!env.DB) {
			throw new Error("worker: DATABASE_TYPE=d1 but env.DB binding is missing");
		}
		return buildQueryApp(new D1Executor(env.DB));
	},
};
