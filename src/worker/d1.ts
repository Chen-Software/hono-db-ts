/**
 * D1 Worker — the full Worker module for the D1 dialect. Only bundled when
 * `DATABASE_TYPE=d1` (via the `src/macros/db-worker.ts` macro), so the Worker
 * ships just this backend.
 *
 * The D1 client is built directly from the Worker's D1 binding via
 * `drizzle-orm/d1` (per https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1).
 * It does NOT use `src/db/client.ts` — that module targets the Bun/local
 * runtime (`bun:sqlite`, Bun macros) which Wrangler/esbuild cannot bundle.
 */
import { createApp } from "../app";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { createD1MoviesRepo } from "../repo/movies-repo-d1";
import type { MoviesRepo } from "../repo/movies-repo";

export function createRepoFromEnv(env: CloudflareBindings): MoviesRepo {
	const db = drizzle(env.DB, { schema });
	return createD1MoviesRepo(db);
}

export default {
	async fetch(
		request: Request,
		env: CloudflareBindings,
		ctx: ExecutionContext,
	) {
		const repo = createRepoFromEnv(env);
		return createApp(repo).fetch(request, env, ctx);
	},
};
