/**
 * Cloudflare Worker entry point.
 *
 * Bundled by Bun (`bun run build` -> `scripts/build.ts`) as `dist/worker.js`,
 * which executes the Bun macros below **at build time**. `src/macros/db-worker.ts`
 * inlines the module specifier of the active dialect's Worker factory, so this
 * file statically imports **only the active backend** — a `turso` build ships
 * just the Turso factory + driver, never `postgres`/Neon or D1, and vice versa.
 *
 * There is no runtime branch over backends: the single `await import(workerModule())`
 * resolves to the one factory selected at build time, and each factory reads the
 * bindings for its dialect (`env.TURSO_URL`, `env.HYPERDRIVE`, or `env.DB`).
 *
 *   - `DATABASE_TYPE=turso` -> Turso Cloud via `@libsql/client/http`
 *   - `DATABASE_TYPE=neon`  -> serverless Postgres via Hyperdrive
 *   - `DATABASE_TYPE=d1`    -> D1 (`env.DB`)
 */

import { createApp } from "./app";
import type { MoviesRepo } from "./repo/movies-repo";
import { workerModule } from "./macros/db-worker" with { type: "macro" };

type WorkerFactory = {
	createRepoFromEnv: (env: CloudflareBindings) => MoviesRepo;
};

// The macro inlines the module path, so this resolves to the single selected
// backend at build time (tree-shaking the rest).
const factory = (await import(workerModule())) as WorkerFactory;

export default {
	async fetch(
		request: Request,
		env: CloudflareBindings,
		ctx: ExecutionContext,
	) {
		const repo: MoviesRepo = factory.createRepoFromEnv(env);
		return createApp(repo).fetch(request, env, ctx);
	},
};
