/**
 * Neon Worker — the full Worker module for the Neon (serverless Postgres via
 * Hyperdrive) dialect. Only bundled when `DATABASE_TYPE=neon` (via the
 * `src/macros/db-worker.ts` macro).
 *
 * The Worker is Bun-bundled, so the env-aware `schema/index.ts` (Bun macro)
 * resolves to the Postgres schema for `neon`.
 */
import { createClient } from "../db/client";
import { schemas } from "../db/schema";
import { createRepos, type PgRepoDb, type Repos } from "../repo/repos";
import { createWorker } from "./index";

export default createWorker(createReposFromEnv);

/** Build all repos (movies, directors, …) from the Worker's Hyperdrive binding. */
export async function createReposFromEnv(
	env: CloudflareBindings,
): Promise<Repos> {
	const db = (await createClient(env)) as unknown as PgRepoDb;
	return createRepos(db, schemas.schema);
}
