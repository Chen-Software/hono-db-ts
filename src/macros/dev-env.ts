/**
 * Build-time local dev env resolution via Bun macros.
 *
 * Import with `with { type: "macro" }`. The function bodies run **once at build
 * time** (when `bun run dev` / `bun run build` run) and their return values are
 * inlined into the emitted code as literals.
 *
 * Determines the LOCAL dev env file for the active dialect:
 *   - `DATABASE_TYPE` (Bun auto-loads `.env`) — missing defaults to `d1`.
 *   - maps the dialect to a local dev file.
 *   - priority: `.env.dev` (if it matches the dialect) → `.env.dev.<type>` →
 *     `.env.dev`.
 *
 * Mapping (all LOCAL — never cloud/production):
 *   - `d1`        -> `.env.dev.d1` (sets DATABASE_TYPE=sqlite, closest to D1)
 *   - `sqlite`    -> `.env.dev`
 *   - `postgres`  -> `.env.example.postgres`
 *   - `neon`      -> `.env.dev.neon` (local Postgres)
 *   - `turso`     -> `.env.dev.turso` (local `file://` libSQL)
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type DevDialect = "sqlite" | "postgres" | "neon" | "turso" | "d1";

/** Normalize `DATABASE_TYPE` to a dev dialect (missing -> `d1`). */
function normalizeDialect(raw: string | undefined): DevDialect {
	const type = (raw ?? "d1").toLowerCase();
	if (type === "postgres" || type === "postgresql" || type === "pg")
		return "postgres";
	if (type === "neon") return "neon";
	if (type === "turso" || type === "turso-cloud" || type === "tursodb")
		return "turso";
	if (type === "d1") return "d1";
	return "sqlite";
}

/** Read `DATABASE_TYPE=` from a local env file (they aren't auto-loaded). */
function envFileDialect(root: string, file: string): string {
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

/** The active dev dialect — inlined at build time. */
export function devDialect(): DevDialect {
	return normalizeDialect(process.env["DATABASE_TYPE"]);
}

/** The local dev env file for the active dialect — inlined at build time. */
export function devEnvFile(): string {
	const dialect = devDialect();

	const typeFile = {
		sqlite: ".env.dev",
		postgres: ".env.example.postgres",
		neon: ".env.dev.neon",
		turso: ".env.dev.turso",
		d1: ".env.dev.d1",
	}[dialect] as string;

	const root = resolve(process.cwd(), ".");
	// Priority: `.env.dev` (if it matches the dialect) → `.env.dev.<type>`.
	if (
		existsSync(resolve(root, ".env.dev")) &&
		envFileDialect(root, ".env.dev") === dialect
	) {
		return ".env.dev";
	}
	return typeFile;
}
