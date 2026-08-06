/**
 * Neon Worker — the full Worker module for the Neon (serverless Postgres via
 * Hyperdrive) dialect. Only bundled when `DATABASE_TYPE=neon` (via the
 * `src/macros/db-worker.ts` macro), so the Worker ships just this backend.
 */
import { createApp } from "../app";
import { createNeonHyperdriveClient } from "../db/neon-client";
import { createPostgresMoviesRepo } from "../repo/movies-repo-postgres";
import type { MoviesRepo } from "../repo/movies-repo";

export function createRepoFromEnv(env: CloudflareBindings): MoviesRepo {
	const db = createNeonHyperdriveClient(env.HYPERDRIVE.connectionString);
	return createPostgresMoviesRepo(db);
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
