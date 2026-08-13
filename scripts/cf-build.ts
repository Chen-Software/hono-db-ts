/**
 * cf-build — bundle `src/worker.ts` into a deployable Cloudflare Worker.
 *
 * Selects the database backend at BUILD time via the `databaseType()` macro and
 * injects its module path as the compile-time constant `__BACKEND__`:
 *
 *   - `DATABASE_TYPE=d1`     → `./worker/d1`     (durable D1 via env.DB)
 *   - `DATABASE_TYPE=sqlite` → `./worker/sqlite` (in-memory bun:sqlite)
 *   - `DATABASE_TYPE=turso`  → `./worker/turso`  (external libSQL)
 *
 * Because `__BACKEND__` is a compile-time constant, Bun resolves and inlines
 * ONLY the selected backend — the unselected module (and its `bun:sqlite`
 * import) never enters the deployed bundle.
 *
 * The sqlite backend also declares `__MIGRATIONS_SQL__`; this script reads the
 * concatenated `drizzle/*.sql` contents and inlines them so the sqlite worker
 * has no filesystem dependency at runtime (the d1 worker never references it).
 *
 *   1. regenerates the migration SQL from the current models
 *      (`db:generate`, so `drizzle/*.sql` is always in sync),
 *   2. reads the concatenated `drizzle/*.sql` contents,
 *   3. builds `src/worker.ts` with `__BACKEND__` + `__MIGRATIONS_SQL__`
 *      inlined via Bun's `define`.
 *
 * Output: `dist/worker.js` — point `wrangler.jsonc`'s `main` at it.
 *
 * Run directly (`bun run scripts/cf-build.ts`) or via the CLI
 * (`bun run src/main.ts cf-build` / `generate`). The env used at build time
 * controls the macros (`DATABASE_TYPE`, `NODE_ENV`); production is
 * `NODE_ENV=production` with `DATABASE_TYPE=d1` + `DATABASE_URL=d1:bbs-db`.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { env, databaseType } from "../src/macros/envs" with { type: "macro" };

const root = resolve(import.meta.dir, "..");
const MIGRATIONS_DIR = resolve(root, "drizzle");

const type = databaseType();
const backend =
	type === "d1"
		? "./worker/d1"
		: type === "turso"
			? "./worker/turso"
			: "./worker/sqlite";

console.log(
	`[cf-build] NODE_ENV=${env()} DATABASE_TYPE=${type} backend=${backend}`,
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
		__BACKEND__: JSON.stringify(backend),
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
console.log(`Built worker (${backend}, ${migrationsSql.length} bytes of schema) to dist/`);
