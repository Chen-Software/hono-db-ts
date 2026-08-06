/**
 * Cloudflare Worker entry point.
 *
 * Bundled by Wrangler (esbuild) for `wrangler dev` / `wrangler deploy`. It
 * selects the repository based on the bindings present:
 *
 *   - `TURSO_URL` (var binding)       -> Turso Cloud (via `@libsql/client/web`)
 *   - `HYPERDRIVE` (Hyperdrive)       -> Neon (serverless Postgres via Hyperdrive)
 *   - otherwise (`env.DB`)            -> D1
 *
 * It never imports `bun:sqlite`, the local dialect factory (`src/db/index.ts`),
 * or any Bun macro. This is what lets the Worker build without a stub.
 */

import { createApp } from "./app";
import { createNeonHyperdriveClient } from "./db/neon-client";
import { createTursoWorkerClient } from "./db/turso-worker-client";
import type { MoviesRepo } from "./repo/movies-repo";
import { createD1MoviesRepo } from "./repo/movies-repo-d1";
import { createPostgresMoviesRepo } from "./repo/movies-repo-postgres";
import { createTursoMoviesRepo } from "./repo/movies-repo-turso";

function createRepo(env: CloudflareBindings): MoviesRepo {
	if (env.TURSO_URL) {
		const db = createTursoWorkerClient(env.TURSO_URL, env.TURSO_AUTH_TOKEN);
		return createTursoMoviesRepo(db);
	}
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
