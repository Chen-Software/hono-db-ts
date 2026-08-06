/**
 * Neon Worker — the full Worker module for the Neon (serverless Postgres via
 * Hyperdrive) dialect. Only bundled when `DATABASE_TYPE=neon` (via the
 * `src/macros/db-worker.ts` macro), so the Worker ships just this backend.
 */
import { createNeonHyperdriveClient } from "../db/neon-client";
import { createPostgresMoviesRepo } from "../repo/movies-repo";
import { createWorker } from "./index";

export default createWorker(createRepoFromEnv);

/** Build the Neon repo from the Worker's Hyperdrive binding. */
export function createRepoFromEnv(env: CloudflareBindings) {
	const db = createNeonHyperdriveClient(env.HYPERDRIVE.connectionString);
	return createPostgresMoviesRepo(db);
}
