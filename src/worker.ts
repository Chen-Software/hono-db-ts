/**
 * Cloudflare Worker entry point.
 *
 * Bundled by Wrangler (esbuild) for `wrangler dev` / `wrangler deploy`. It
 * selects the repository based on the bindings present:
 *
 *   - if a `HYPERDRIVE` binding is available -> Neon (serverless Postgres via
 *     Hyperdrive), using `postgres-js` + `nodejs_compat`.
 *   - otherwise -> the D1 binding (`env.DB`).
 *
 * It never imports `bun:sqlite`, the local dialect factory (`src/db/index.ts`),
 * or any Bun macro. This is what lets the Worker build without a stub.
 */

import { createApp } from "./app";
import { createNeonHyperdriveClient } from "./db/neon-client";
import type { MoviesRepo } from "./repo/movies-repo";
import { createD1MoviesRepo } from "./repo/movies-repo-d1";
import { createPostgresMoviesRepo } from "./repo/movies-repo-postgres";

function createRepo(env: CloudflareBindings): MoviesRepo {
	if (env.HYPERDRIVE) {
		const db = createNeonHyperdriveClient(env.HYPERDRIVE.connectionString);
		return createPostgresMoviesRepo(db);
	}
	return createD1MoviesRepo(env.DB);
}

export default {
	async fetch(
		request: Request,
		env: CloudflareBindings,
		ctx: ExecutionContext,
	) {
		const repo: MoviesRepo = createRepo(env);
		return createApp(repo).fetch(request, env, ctx);
	},
};
