/**
 * Turso Worker — the full Worker module for the Turso dialect. Only bundled
 * when `DATABASE_TYPE=turso` (via the `src/macros/db-worker.ts` macro), so the
 * Worker ships just this backend.
 */
import { createClient } from "../db/client";
import { schemas } from "../db/schema";
import { createRepos, type Repos, type SqliteRepoDb } from "../repo/repos";
import { createWorker } from "./index";

export default createWorker(createReposFromEnv);

/** Build all repos (movies, directors, …) from the Worker's Turso bindings. */
export async function createReposFromEnv(
	env: CloudflareBindings,
): Promise<Repos> {
	const db = (await createClient(env)) as unknown as SqliteRepoDb;
	return createRepos(db, schemas.schema);
}
