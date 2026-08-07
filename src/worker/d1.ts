/**
 * D1 Worker — the full Worker module for the D1 dialect. Only bundled when
 * `DATABASE_TYPE=d1` (via the `src/macros/db-worker.ts` macro), so the Worker
 * ships just this backend.
 *
 * The D1 client is built directly from the Worker's D1 binding via
 * `drizzle-orm/d1` (per https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1).
 * It does NOT use `src/db/client.ts` — that module targets the Bun/local
 * runtime (`bun:sqlite`, Bun macros) which Wrangler/esbuild cannot bundle.
 */
import { schemas } from "../db/schema";
import { createRepos, type Repos } from "../repo/repos";
import { createWorker } from "./index";
import { createClient } from "@/db";

export default createWorker(createReposFromEnv);

/** Build all repos (movies, directors, …) from the Worker's D1 binding. */
export async function createReposFromEnv(env: CloudflareBindings): Promise<Repos> {
	const { db } = await createClient(env as any);
	return createRepos(db, schemas.schema);
}
