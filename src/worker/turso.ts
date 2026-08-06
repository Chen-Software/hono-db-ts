/**
 * Turso worker factory — builds the movies repo from `env` bindings for the
 * Turso dialect. Only imported when `DATABASE_TYPE=turso` (via the
 * `src/macros/db-worker.ts` macro), so the Worker bundle ships just this
 * backend.
 */
import { createTursoWorkerClient } from "../db/turso-worker-client";
import { createTursoMoviesRepo } from "../repo/movies-repo-turso";
import type { MoviesRepo } from "../repo/movies-repo";

export function createRepoFromEnv(env: CloudflareBindings): MoviesRepo {
	const db = createTursoWorkerClient(env.TURSO_URL, env.TURSO_AUTH_TOKEN);
	return createTursoMoviesRepo(db);
}
