/**
 * Local Bun entry point.
 *
 * Runs under `bun run dev` / `bun run start`. The local SQLite repository is
 * bound directly; the dialect itself (sqlite vs postgres) is resolved at build
 * time in `src/db/index.ts` via the `src/macros/db.ts` macros.
 *
 * The Cloudflare Worker uses a separate entry (`src/worker.ts`) that only talks
 * to D1, so this module is never bundled into the Worker and can freely use
 * Bun-only drivers.
 */

import { createApp } from "./app";
import { createSqliteMoviesRepo } from "./repo/movies-repo-sqlite";

export { createApp };

export default {
	async fetch(request: Request) {
		return createApp(createSqliteMoviesRepo()).fetch(request);
	},
};
