/**
 * Dialect-aware local dev launcher.
 *
 * Bun auto-loads `.env` into `process.env`; the active dialect and the matching
 * local env file are resolved at build time by the `src/macros/dev-env.ts`
 * macros (missing `DATABASE_TYPE` defaults to `d1`).
 *
 * Each dialect runs a LOCAL dev server with a local driver:
 *   - `d1`        -> local `sqlite` driver (closest to D1), `.env.dev.d1`
 *   - `sqlite`    -> Bun server with `.env.dev`
 *   - `postgres`  -> Bun server with `.env.dev.postgres` (local Postgres)
 *   - `neon`      -> Bun server with `.env.dev.neon` against a LOCAL Postgres
 *                    (Neon Local via `docker compose up -d`)
 *   - `turso`     -> Bun server with `.env.dev.turso` (local `file://` libSQL)
 *
 * Usage:  bun run dev   (or `bun run dev.ts`)
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { devDialect, devEnvFile } from "../src/macros/dev-env" with {
	type: "macro",
};

const root = resolve(import.meta.dir, "..");

const dialect = devDialect();
const envFile = devEnvFile();

// Neon uses a LOCAL Postgres (Neon Local). Ensure it's running first.
if (dialect === "neon") {
	console.log("[dev] neon → ensuring local Postgres is up (docker compose up -d)");
	spawnSync("docker", ["compose", "up", "-d"], { cwd: root, stdio: "inherit" });
}

console.log(`[dev] dialect=${dialect} → env-file=${envFile}`);
const args = ["run", `--env-file=${envFile}`, "--watch", "src/main.ts"];
const result = spawnSync("bun", args, { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
