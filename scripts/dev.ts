/**
 * Dialect-aware local dev launcher.
 *
 * Bun auto-loads `.env` into `process.env`, so the active dialect comes from
 * `process.env.DATABASE_TYPE`. If it's missing, we default to `d1`.
 *
 * Each dialect runs a LOCAL dev server with a local driver:
 *   - `d1`        -> local `sqlite` driver (closest to D1), `.env.dev`
 *   - `sqlite`    -> Bun server with `.env.dev`
 *   - `postgres`  -> Bun server with `.env.example.postgres` (local Postgres)
 *   - `neon`      -> Bun server with `.env.dev.neon` against a LOCAL Postgres
 *                    (Neon Local via `docker compose up -d`)
 *   - `turso`     -> Bun server with `.env.dev.turso` (local `file://` libSQL)
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

// Local env file per dialect. `d1` uses `.env.dev.d1` (which sets
// DATABASE_TYPE=sqlite — the closest local driver to D1); `neon` uses a local
// dev file pointing at a LOCAL Postgres.
const typeFile = {
	sqlite: ".env.dev",
	postgres: ".env.example.postgres",
	neon: ".env.dev.neon",
	turso: ".env.dev.turso",
	d1: ".env.dev.d1",
}[activeType] as string;

// Priority: `.env.dev` (if it matches the active dialect) → `.env.dev.<type>` → `.env.dev`.
function resolveEnvFile(): string {
	if (existsSync(resolve(root, ".env.dev")) && envFileDialect(".env.dev") === activeType) {
		return ".env.dev";
	}
	return typeFile;
}

// Neon uses a LOCAL Postgres (Neon Local). Ensure it's running first.
if (activeType === "neon") {
	console.log("[dev] neon → ensuring local Postgres is up (docker compose up -d)");
	spawnSync("docker", ["compose", "up", "-d"], { cwd: root, stdio: "inherit" });
}

// D1 uses the local sqlite driver (closest to D1) — a local Bun server.
const envFile = resolveEnvFile();
console.log(`[dev] dialect=${activeType} → env-file=${envFile}`);
const args = ["run", `--env-file=${envFile}`, "--watch", "src/main.ts"];
const result = spawnSync("bun", args, { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
