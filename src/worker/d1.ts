/**
 * D1 Worker — the full Worker module for the D1 dialect. Only bundled when
 * `DATABASE_TYPE=d1` (via the `src/macros/db-worker.ts` macro), so the Worker
 * ships just this backend.
 */
import { createApp } from "../app";
import { createD1MoviesRepo } from "../repo/movies-repo-d1";
import type { MoviesRepo } from "../repo/movies-repo";

export function createRepoFromEnv(env: CloudflareBindings): MoviesRepo {
	return createD1MoviesRepo(env.DB);
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
