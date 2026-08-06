/**
 * Dialect-aware local dev launcher.
 *
 * Bun auto-loads `.env` into `process.env`, so the active dialect comes from
 * `process.env.DATABASE_TYPE`. If it's missing, we default to `d1`.
 *
 * For each dialect we run the matching LOCAL dev server:
 *   - `d1`        -> `bun x wrangler dev` (the Worker runs locally with D1)
 *   - `sqlite`    -> Bun server with `.env.dev`
 *   - `postgres`  -> Bun server with `.env.example.postgres`
 *   - `neon`      -> Bun server with `.env.dev.neon`
 *   - `turso`     -> Bun server with `.env.dev.turso` (local `file://` libSQL)
 *
 * The type-specific dev files (`.env.dev.turso`, `.env.dev.neon`, …) are NOT
 * auto-loaded by Bun, so they're passed via `--env-file`. Turso has a `turso dev`
 * local server CLI, but the local file SDK (`.env.dev.turso`) is simpler and
 * recommended for most dev, so we use that.
 *
 * Usage:  bun run dev   (or `bun run dev.ts`)
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

// Active dialect: Bun auto-loads `.env` into process.env. Missing -> `d1`.
const envType = (process.env["DATABASE_TYPE"] || "d1").toLowerCase();
const activeType = (() => {
	if (envType === "postgres" || envType === "postgresql" || envType === "pg")
		return "postgres";
	if (envType === "neon") return "neon";
	if (envType === "turso" || envType === "turso-cloud" || envType === "tursodb")
		return "turso";
	if (envType === "d1") return "d1";
	return "sqlite";
})();

// Read `.env.dev`'s own DATABASE_TYPE (not auto-loaded by Bun).
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

// Local env file per dialect (type-specific files are loaded via --env-file).
// `d1` has no local env file (handled separately via wrangler dev).
const typeFile = {
	sqlite: ".env.dev",
	postgres: ".env.example.postgres",
	neon: ".env.dev.neon",
	turso: ".env.dev.turso",
	d1: ".env.dev",
}[activeType] as string;

// Priority: `.env.dev` (if it matches the active dialect) → `.env.dev.<type>` → `.env.dev`.
function resolveEnvFile(): string {
	if (existsSync(resolve(root, ".env.dev")) && envFileDialect(".env.dev") === activeType) {
		return ".env.dev";
	}
	return typeFile;
}

// D1 (and the missing-DATABASE_TYPE default) runs the Worker locally via wrangler.
if (activeType === "d1") {
	console.log("[dev] dialect=d1 → bun x wrangler dev");
	const result = spawnSync("bun", ["x", "wrangler", "dev"], {
		cwd: root,
		stdio: "inherit",
	});
	process.exit(result.status ?? 1);
}

// Local Bun server for sqlite / postgres / neon / turso.
const envFile = resolveEnvFile();
console.log(`[dev] dialect=${activeType} → env-file=${envFile}`);
const args = ["run", `--env-file=${envFile}`, "--watch", "src/main.ts"];
const result = spawnSync("bun", args, { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
