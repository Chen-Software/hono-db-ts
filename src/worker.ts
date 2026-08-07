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
import * as d1Worker from "./worker/d1";
import * as neonWorker from "./worker/neon";
import * as postgresWorker from "./worker/postgres";
import * as sqliteWorker from "./worker/sqlite";
import * as tursoWorker from "./worker/turso";

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
