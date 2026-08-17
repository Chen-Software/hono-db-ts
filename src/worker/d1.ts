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

import { Hono } from "hono";
import { buildQueryApp } from "@/http/app";
import { betterAuthEnabled } from "@/macros/envs" with { type: "macro" };
import { localGitBackend, r2GitBackend, type GitBackend } from "@/git/backend";
import { mountGitRoutes } from "@/git/routes";
import type { R2Like } from "@/git/fs-r2";
import type { SqlQueryExecutor, WorkerBackend, WorkerEnv } from "./types";

/** Adapter turning the Workers D1 binding into the `SqlQueryExecutor` shape. */
export class D1Executor implements SqlQueryExecutor {
	constructor(private readonly db: D1Database) {}

	unsafe(sql: string, params: unknown[] = []): Promise<unknown[]> {
		const stmt = this.db.prepare(sql);
		const bound = params.length > 0 ? stmt.bind(...params) : stmt;
		return bound.all().then((res) => res.results);
	}
}

export const backend: WorkerBackend = {
	async init(env: WorkerEnv) {
		if (!env.DB) {
			throw new Error("worker: DATABASE_TYPE=d1 but env.DB binding is missing");
		}
		const app = new Hono();

		// Git object backend: R2 in production (binding `REPOS`), local fs in dev.
		const gitRoot = process.env.GIT_ROOT || ".gitdata";
		const gitBackend: GitBackend | null = env.REPOS ? r2GitBackend(env.REPOS as R2Like) : localGitBackend(gitRoot);

		// Better Auth is OPTIONAL. `betterAuthEnabled()` inlines to a literal at
		// build time, so `BETTER_AUTH_ENABLED=false` drops the auth bundle
		// (better-auth + drizzle adapter) from the deployed worker.
		if (betterAuthEnabled()) {
			const { drizzle } = await import("drizzle-orm/d1");
			const { mountBetterAuthFromBindings } = await import("@/auth/mount");
			// Better Auth first — `/api/auth/*` must win over the query app's `/api`.
			mountBetterAuthFromBindings(app, env, drizzle(env.DB));
		}

		// The query app (read routes + generated CRUD) under /api.
		app.route("/api", buildQueryApp(new D1Executor(env.DB), undefined, gitBackend));
		// Git smart-HTTP transport at the root (/owner/repo.git/...).
		if (gitBackend) mountGitRoutes(app, { db: new D1Executor(env.DB), gitBackend });
		return app;
	},
};
