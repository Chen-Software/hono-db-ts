/**
 * SQLite Worker — the full Worker module for local SQLite development
 * (e.g. `wrangler dev --env=sqlite`). Only bundled when
 * `DATABASE_TYPE=sqlite` (via the build-time macro).
 *
 * Uses a D1 binding (`env.DB`) with the `drizzle-orm/d1` driver — avoiding
 * `bun:sqlite` which is unresolvable in workerd. Wrangler's local D1 dev
 * mode creates a real SQLite file under `.wrangler/state/`, so this worker
 * gives you file-based SQLite for `wrangler dev` without needing a native
 * module.
 *
 * Not deployed to production — use the `d1` dialect for Cloudflare D1.
 */
import { drizzle } from "drizzle-orm/d1";
import { schemas } from "../db/schema";
import { createRepos, type Repos } from "../repo/repos";
import { createWorker } from "./index";

export default createWorker(createReposFromEnv);

/** Build all repos (movies, directors, …) from the Worker's D1 binding. */
export function createReposFromEnv(env: CloudflareBindings): Repos {
	const db = drizzle(env.DB, { schema: schemas.schema });
	return createRepos(db, schemas.schema);
}
