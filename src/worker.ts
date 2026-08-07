/**
 * Cloudflare Worker entry point.
 *
 * Bundled by Bun (`scripts/build.ts`) — not by Wrangler. The `db-worker` macro
 * runs at build time and inlines the dialect-specific module specifier (e.g.
 * `"./worker/neon"`), so only one backend ships in the final bundle.
 *
 * Wrangler uploads the pre-built `dist/worker.js` (`wrangler.jsonc` -> `main`).
 */

import { dialect } from "./macros/db";

	switch (dialect()) {
		case "neon":
		case "postgres":
			return "./worker/neon";
		case "turso":
			return "./worker/turso";
		case "d1":
		case "sqlite":
		default:
			return "./worker/d1";
	}

export default mod.default;
