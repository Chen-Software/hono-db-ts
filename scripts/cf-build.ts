/**
 * cf-build — bundle `src/worker.ts` into a deployable Cloudflare Worker.
 *
 * The worker entry declares `declare const __MIGRATIONS_SQL__: string` and
 * applies it to an in-memory sqlite client at startup. This script:
 *
 *   1. regenerates the migration SQL from the current models
 *      (`db:generate`, so `drizzle/*.sql` is always in sync),
 *   2. reads the concatenated `drizzle/*.sql` contents,
 *   3. builds `src/worker.ts` with `__MIGRATIONS_SQL__` inlined as a string
 *      literal via Bun's `define` (no filesystem dependency at runtime).
 *
 * Output: `dist/worker.js` — point `wrangler.jsonc`'s `main` at it.
 *
 * Run directly (`bun run scripts/cf-build.ts`) or via the CLI
 * (`bun run src/main.ts cf-build`). The env used at build time controls the
 * macros (`DATABASE_TYPE`, `NODE_ENV`); production is `NODE_ENV=production`
 * with `DATABASE_TYPE=sqlite` + `DATABASE_URL=:memory:`.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { env, databaseType } from "../src/macros/envs" with { type: "macro" };

const root = resolve(import.meta.dir, "..");
const MIGRATIONS_DIR = resolve(root, "drizzle");

console.log(
	`[cf-build] NODE_ENV=${env()} DATABASE_TYPE=${databaseType()}`,
);

const files = readdirSync(MIGRATIONS_DIR)
	.filter((f) => f.endsWith(".sql"))
	.sort();
if (files.length === 0) {
	console.error(
		"[cf-build] no migration files in drizzle/ — run `bun run src/main.ts db:generate sqlite` first.",
	);
	process.exit(1);
}
const migrationsSql = files
	.map((f) => `-- ${f}\n${readFileSync(resolve(MIGRATIONS_DIR, f), "utf8")}`)
	.join("\n");

const result = await Bun.build({
	entrypoints: [resolve(root, "src/worker.ts")],
	outdir: resolve(root, "dist"),
	target: "bun",
	format: "esm",
	sourcemap: "linked",
	define: {
		__MIGRATIONS_SQL__: JSON.stringify(migrationsSql),
	},
});

if (!result.success) {
	for (const log of result.logs) console.error(log);
	process.exit(1);
}

for (const output of result.outputs) {
	console.log(`  ${output.path}`);
}
console.log(`Built worker (${migrationsSql.length} bytes of schema) to dist/`);
