/**
 * Build-time DB repo selection via Bun macros.
 *
 * Import with `with { type: "macro" }`. These run **once at build time** and
 * inline a **string literal** (the module specifier of the active dialect's
 * repo). The consumer then does a static `await import(<literal>)`, so the
 * bundler resolves it at build time and **tree-shakes away every other dialect's
 * repo** (e.g. no Turso repo when using d1, and vice versa).
 *
 * Mapping (`DATABASE_TYPE`, missing -> `d1`):
 *   - `d1`        -> `"../repo/movies-repo-sqlite"` (sqlite is closest to D1)
 *   - `sqlite`    -> `"../repo/movies-repo-sqlite"`
 *   - `postgres`  -> `"../repo/movies-repo-postgres"`
 *   - `neon`      -> `"../repo/movies-repo-postgres"` (same schema)
 *   - `turso`     -> `"../repo/movies-repo-turso"`
 */

import type { DbDialect } from "./db";

function normalizeDialect(raw: string | undefined): DbDialect {
	const type = (raw ?? "d1").toLowerCase();
	if (type === "postgres" || type === "postgresql" || type === "pg")
		return "postgres";
	if (type === "neon") return "neon";
	if (type === "turso" || type === "turso-cloud" || type === "tursodb")
		return "turso";
	if (type === "d1") return "d1";
	return "sqlite";
}

/** The active DB dialect — inlined at build time. */
export function dbDialect(): DbDialect {
	return normalizeDialect(process.env["DATABASE_TYPE"]);
}

/**
 * The repo module specifier for the active dialect — inlined at build time.
 * `d1` maps to the sqlite repo (closest local driver). Import the result
 * statically: `const mod = await import(repoModule())`.
 */
export function repoModule(): string {
	switch (dbDialect()) {
		case "postgres":
		case "neon":
			return "../repo/movies-repo-postgres";
		case "turso":
			return "../repo/movies-repo-turso";
		case "sqlite":
		case "d1":
		default:
			return "../repo/movies-repo-sqlite";
	}
}
