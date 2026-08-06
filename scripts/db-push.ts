/**
 * Dispatches `drizzle-kit push` to the config for the active `DATABASE_TYPE`.
 *
 * The dialect comes from the active env:
 *   - **default (prod)**  -> `.env` (auto-loaded by Bun).
 *   - **`--dev`**         -> the matching `.env.dev.<type>` (via the
 *     `src/macros/dev-env.ts` macro).
 *
 * Config mapping:
 *   - `sqlite` / `turso` / `d1` -> `drizzle.config.sqlite.ts`
 *   - `postgres` / `neon`       -> `drizzle.config.postgres.ts`
 *
 * Usage:
 *   bun run db:push                  # push for the active DATABASE_TYPE (.env)
 *   bun run db:push --dev            # push using .env.dev.<type>
 *   DATABASE_TYPE=neon bun run db:push  # force neon/postgres
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dbDialect } from "../src/macros/db-dialect" with { type: "macro" };
import { devEnvFile } from "../src/macros/dev-env" with { type: "macro" };

const isDev = process.argv.includes("--dev");

/** Merge a `.env`-style file into `process.env` (does not override existing). */
function loadEnvFile(file: string): void {
	try {
		for (const line of readFileSync(file, "utf8").split("\n")) {
			const t = line.trim();
			if (!t || t.startsWith("#") || !t.includes("=")) continue;
			const eq = t.indexOf("=");
			const key = t.slice(0, eq).trim();
			let value = t.slice(eq + 1).trim();
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}
			if (process.env[key] === undefined) process.env[key] = value;
		}
	} catch {
		// file may not exist
	}
}

// In --dev mode, load the matching .env.dev.<type> (its DATABASE_TYPE then
// drives the config choice below). Otherwise use the auto-loaded .env.
if (isDev) {
	const devFile = devEnvFile();
	loadEnvFile(resolve(process.cwd(), devFile));
	console.log(`[db:push] --dev → env-file=${devFile}`);
}

// sqlite / turso / d1 → sqlite config; postgres / neon → postgres config.
const dialect = dbDialect();
const isPostgresDialect = dialect === "postgres" || dialect === "neon";
const config = isPostgresDialect
	? "drizzle.config.postgres.ts"
	: "drizzle.config.sqlite.ts";

console.log(`[db:push] dialect=${dialect} → config=${config}`);
const result = spawnSync(
	"bun",
	["x", "drizzle-kit", "push", "--config", config],
	{ cwd: resolve(import.meta.dir, ".."), stdio: "inherit" },
);
process.exit(result.status ?? 1);
