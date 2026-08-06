/**
 * D1 worker factory — builds the movies repo from the `env.DB` binding for the
 * D1 dialect. Only imported when `DATABASE_TYPE=d1` (via the
 * `src/macros/db-worker.ts` macro), so the Worker bundle ships just this
 * backend.
 */
import { createD1MoviesRepo } from "../repo/movies-repo-d1";
import type { MoviesRepo } from "../repo/movies-repo";

export function createRepoFromEnv(env: CloudflareBindings): MoviesRepo {
	return createD1MoviesRepo(env.DB);
}
