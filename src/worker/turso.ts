/**
 * Turso Worker — the full Worker module for the Turso dialect. Only bundled
 * when `DATABASE_TYPE=turso` (via the `src/macros/db-worker.ts` macro), so the
 * Worker ships just this backend.
 */
import { createTursoWorkerClient } from "../db/turso-worker-client";
import { createSqliteMoviesRepo } from "../repo/movies-repo";
import { createWorker } from "./index";

export default createWorker(createRepoFromEnv);

/** Build the Turso repo from the Worker's Turso bindings. */
export function createRepoFromEnv(env: CloudflareBindings) {
	const db = createTursoWorkerClient(env.TURSO_URL, env.TURSO_AUTH_TOKEN);
	return createSqliteMoviesRepo(db);
}
