/**
 * Neon worker factory — builds the movies repo from `env` bindings for the
 * Neon (serverless Postgres via Hyperdrive) dialect. Only imported when
 * `DATABASE_TYPE=neon` (via the `src/macros/db-worker.ts` macro), so the Worker
 * bundle ships just this backend.
 */
import { createNeonHyperdriveClient } from "../db/neon-client";
import { createPostgresMoviesRepo } from "../repo/movies-repo-postgres";
import type { MoviesRepo } from "../repo/movies-repo";

export function createRepoFromEnv(env: CloudflareBindings): MoviesRepo {
	const db = createNeonHyperdriveClient(env.HYPERDRIVE.connectionString);
	return createPostgresMoviesRepo(db);
}
