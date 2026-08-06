/**
 * Cloudflare Worker entry point.
 *
 * Bundled by Wrangler (esbuild) for `wrangler dev` / `wrangler deploy`. It only
 * ever talks to the D1 binding, so it never imports `bun:sqlite`, the local
 * dialect factory (`src/db/index.ts`), or any Bun macro. This is what lets the
 * Worker build without a stub — the `src/stubs/bun-sqlite.ts` alias is gone.
 */

import { createApp } from "./app";
import type { MoviesRepo } from "./repo/movies-repo";
import { createD1MoviesRepo } from "./repo/movies-repo-d1";

export default {
	async fetch(
		request: Request,
		env: CloudflareBindings,
		ctx: ExecutionContext,
	) {
		const repo: MoviesRepo = createD1MoviesRepo(env.DB);
		return createApp(repo).fetch(request, env, ctx);
	},
};
