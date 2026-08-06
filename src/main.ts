/**
 * Local Bun entry point.
 *
 * Runs under `bun run dev` / `bun run start`. The repository is selected via
 * `src/repo/movies-repo.ts` `createRepo()`, which uses the unified
 * `src/db/client.ts` `createClient()` to build the right repo from `.env` /
 * `NODE_ENV`. `createClient()` dynamic-imports only the active dialect's driver,
 * tree-shaking away unused ones from the local bundle.
 *
 * The Cloudflare Worker uses separate entries (`src/worker/<dialect>.ts`) that
 * select the backend from bindings, so this module is never bundled into the
 * Worker.
 */

import { createApp } from "./app";
import { createRepo } from "./repo/create-repo";

export { createApp };

export default {
	async fetch(request: Request) {
		const repo = await createRepo();
		return createApp(repo).fetch(request);
	},
};
