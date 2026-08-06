/**
 * Local Bun entry point.
 *
 * Runs under `bun run dev` / `bun run start`. The repository is selected at
 * build time by `DATABASE_TYPE` via the `src/macros/db-client.ts` +
 * `src/macros/db-repo.ts` macros (see `src/repo/factory.ts`), which tree-shake
 * away unused dialect drivers from the bundle.
 *
 * The Cloudflare Worker uses a separate entry (`src/worker.ts`) that selects
 * D1 vs Neon from bindings, so this module is never bundled into the Worker.
 */

import { createApp } from "./app";
import { createRepo } from "./repo/factory";

export { createApp };

export default {
	async fetch(request: Request) {
		const repo = await createRepo();
		return createApp(repo).fetch(request);
	},
};
