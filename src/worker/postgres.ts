/**
 * Postgres Worker — the full Worker module for local Postgres development
 * (e.g. `docker compose up` + `wrangler dev --env=postgres`).
 * Only bundled when `DATABASE_TYPE=postgres` (via the build-time macro).
 *
 * Connects to a local Postgres instance using the `postgres` npm driver
 * (TCP, works in workerd with `nodejs_compat`). Not deployed to production
 * — use the `neon` dialect (Hyperdrive) for Cloudflare-deployed Postgres.
 *
 * The Worker is Bun-bundled, so macros run at build time and inlines only
 * the active backend.
 */
import { createClient } from "../db/client";
import { schemas } from "../db/schema";
import { createRepos, type PgRepoDb, type Repos } from "../repo/repos";
import { createWorker } from "./index";

export default createWorker(createReposFromEnv);

/** Build all repos (movies, directors, …) from the Worker's Postgres bindings. */
export async function createReposFromEnv(
	env: CloudflareBindings,
): Promise<Repos> {
	const { db } = await createClient(env);
	return createRepos(db as unknown as PgRepoDb, schemas.schema);
}
