/**
 * worker — Cloudflare Workers entry for the BBS query service.
 *
 * Deploys the SAME Hono app as the local server (`scripts/serve.ts`) but as a
 * Worker: `export default { fetch }` is the platform handler Wrangler bundles.
 *
 * The database backend is selected at BUILD time by `scripts/cf-build.ts`,
 * which injects the module path via the compile-time constant `__BACKEND__`:
 *
 *   - `DATABASE_TYPE=d1` (production) → `./worker/d1` — DURABLE Cloudflare D1
 *     through the `env.DB` binding. D1 is permanent, replicated edge SQLite;
 *     it survives isolate eviction and is shared across requests (Cloudflare
 *     Workers have no writable local filesystem, so a local file is not a
 *     valid production target).
 *   - `DATABASE_TYPE=sqlite` (local dev) → `./worker/sqlite` — in-memory
 *     `bun:sqlite`, NON-durable, for `wrangler dev` only.
 *   - `DATABASE_TYPE=turso` → `./worker/turso` — external libSQL (Turso).
 *
 * Because the import specifier is a compile-time constant, the unselected
 * backend module (and its `bun:sqlite` import) is never included in the
 * deployed bundle.
 */

import type { WorkerBackend, WorkerEnv } from "@/worker/types";

/**
 * Resolved at build time by `scripts/cf-build.ts` to the selected backend
 * module (e.g. `./worker/d1`). The deployed bundle contains only that module.
 */
declare const __BACKEND__: string;

// Static import would defeat the per-backend bundling — `__BACKEND__` is a
// compile-time constant, so Bun resolves and inlines ONLY the selected module.
const backend = (await import(/* @bun */ __BACKEND__)) as {
	backend: WorkerBackend;
};

export default {
	async fetch(request: Request, env: WorkerEnv): Promise<Response> {
		const app = await backend.backend.init(env);
		return app.fetch(request);
	},
};
