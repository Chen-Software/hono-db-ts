/**
 * Dialect-aware local dev launcher.
 *
 * Bun auto-loads `.env` into `process.env`, so the active dialect comes from
 * `process.env.DATABASE_TYPE`. The type-specific dev files (`.env.dev.turso`,
 * `.env.dev.neon`, …) are NOT auto-loaded by Bun, so this script starts the app
 * with the matching `--env-file`.
 *
 * Env file priority (all LOCAL — never cloud/production):
 *   1. `.env.dev` — if it exists AND defines the active `DATABASE_TYPE`
 *   2. `.env.dev.<type>` — the type-specific local file
 *   3. `.env.dev` — final fallback
 *
 * Mapping:
 *   - `sqlite`    -> `.env.dev`
 *   - `postgres`  -> `.env.example.postgres` (local Postgres)
 *   - `neon`      -> `.env.dev.neon`
 *   - `turso`     -> `.env.dev.turso`   (always local `file://`)
 *   - `d1`        -> error (no local driver; use `bun run worker:dev`)
 *
 * Usage:  bun run dev   (or `bun run dev.ts`)
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

// Active dialect: Bun auto-loads `.env` into process.env.
const envType = (process.env["DATABASE_TYPE"] || "sqlite").toLowerCase();
const activeType = (() => {
	if (envType === "postgres" || envType === "postgresql" || envType === "pg")
		return "postgres";
	if (envType === "neon") return "neon";
	if (envType === "turso" || envType === "turso-cloud" || envType === "tursodb")
		return "turso";
	if (envType === "d1") return "d1";
	return "sqlite";
})();

if (activeType === "d1") {
	console.error(
		"`DATABASE_TYPE=d1` has no local driver. Use `bun run worker:dev`, " +
			"or set a local dialect (sqlite / postgres / neon / turso) in .env.",
	);
	process.exit(1);
}

// Type-specific local env file.
const typeFile = {
	sqlite: ".env.dev",
	postgres: ".env.example.postgres",
	neon: ".env.dev.neon",
	turso: ".env.dev.turso",
}[activeType] as string;

// Read `.env.dev`'s own DATABASE_TYPE (it is not auto-loaded by Bun).
function envFileDialect(file: string): string {
	try {
		for (const line of readFileSync(resolve(root, file), "utf8").split("\n")) {
			const t = line.trim();
			if (t.startsWith("DATABASE_TYPE="))
				return t.slice("DATABASE_TYPE=".length).trim().toLowerCase();
		}
	} catch {
		// file may not exist
	}
	return "";
}

// Priority: `.env.dev` (if it matches the active dialect) → `.env.dev.<type>` → `.env.dev`.
let envFile: string;
if (existsSync(resolve(root, ".env.dev")) && envFileDialect(".env.dev") === activeType) {
	envFile = ".env.dev";
} else {
	envFile = typeFile;
}

console.log(`[dev] dialect=${activeType} → env-file=${envFile}`);
const args = ["run", `--env-file=${envFile}`, "--watch", "src/main.ts"];
const result = spawnSync("bun", args, { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
