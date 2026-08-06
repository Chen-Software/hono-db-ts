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
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { createSqliteMoviesRepo } from "../repo/movies-repo";
import { createWorker } from "./index";

export default createWorker(createRepoFromEnv);

/** Build the D1 repo from the Worker's D1 binding. */
export function createRepoFromEnv(env: CloudflareBindings) {
	const db = drizzle(env.DB, { schema });
	return createSqliteMoviesRepo(db);
}
