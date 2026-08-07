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

/**
 * Cloudflare Worker entry point.
 *
 * Bundled by Bun (`scripts/build.ts`) — not by Wrangler. The `db-worker` macro
 * runs at build time and inlines the dialect-specific module specifier (e.g.
 * `"./worker/neon"`), so only one backend ships in the final bundle.
 *
 * Wrangler uploads the pre-built `dist/worker.js` (`wrangler.jsonc` -> `main`).
 */

import { dialect } from "../macros/db";
import * as d1Worker from "./d1";
import * as neonWorker from "./neon";
import * as postgresWorker from "./postgres";
import * as sqliteWorker from "./sqlite";
import * as tursoWorker from "./turso";
import { type TableRepo } from "@/repo/repos";

function getWorker() {
	switch (dialect()) {
		case "neon":
			return neonWorker;
		case "postgres":
			return postgresWorker;
		case "turso":
			return tursoWorker;
		case "d1":
			return d1Worker;
		case "sqlite":
		default:
			return sqliteWorker;
	}
}

const worker = getWorker();

export default worker;


/**
 * Build the Cloudflare Worker module (`{ fetch }`) from a repo factory.

 */
export function createWorker() {
	return {
		async fetch(
			request: Request,
			env: CloudflareBindings,
			ctx: ExecutionContext,
		) {

			return createApp().fetch(request, env, ctx);
		},
	};
}
