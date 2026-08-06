/**
 * Turso Worker — the full Worker module for the Turso dialect. Only bundled
 * when `DATABASE_TYPE=turso` (via the `src/macros/db-worker.ts` macro), so the
 * Worker ships just this backend.
 */
import { createApp } from "../app";
import { createTursoWorkerClient } from "../db/turso-worker-client";
import { createTursoMoviesRepo } from "../repo/movies-repo-turso";
import type { MoviesRepo } from "../repo/movies-repo";

export function createRepoFromEnv(env: CloudflareBindings): MoviesRepo {
	const db = createTursoWorkerClient(env.TURSO_URL, env.TURSO_AUTH_TOKEN);
	return createTursoMoviesRepo(db);
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
