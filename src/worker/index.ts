/**
 * Shared Worker wrapper.
 *
 * Every `src/worker/<dialect>.ts` passes a **repo factory** `(env) => repo` to
 * `createWorker()`, which returns the Cloudflare Worker module (`{ fetch }`).
 * The factory builds the dialect-specific repo from the Worker bindings on each
 * request. This removes the duplicated `{ fetch }` boilerplate across the
 * per-dialect Worker files.
 *
 * NOTE: This does NOT use `src/db/client.ts`'s `createClient()`. That module
 * targets the Bun/local runtime (Bun macros + `bun:sqlite`) which Wrangler/esbuild
 * cannot bundle (`with { type: "macro" }` is unsupported, and `bun:sqlite` is
 * unresolvable). Each Worker builds its client directly from Worker bindings
 * instead.
 */

import { createApp } from "../app";
import type { MoviesRepo } from "../repo/movies-repo";

/**
 * Build the Cloudflare Worker module (`{ fetch }`) from a repo factory.
 * @param buildRepo builds the movies repo from the Worker bindings.
 */
export function createWorker(
	buildRepo: (env: CloudflareBindings) => MoviesRepo,
) {
	return {
		async fetch(
			request: Request,
			env: CloudflareBindings,
			ctx: ExecutionContext,
		) {
			const repo = buildRepo(env);
			return createApp(repo).fetch(request, env, ctx);
		},
	};
}
