/**
 * Build-time DB client selection via Bun macros.
 *
 * Import with `with { type: "macro" }`. These run **once at build time** and
 * inline a **string literal** (the module specifier of the active dialect's
 * client). The consumer then does a static `await import(<literal>)`, so the
 * bundler resolves it at build time and **tree-shakes away every other dialect's
 * driver** (e.g. no `@libsql/client` when using d1, and vice versa).
 *
 * Mapping (`DATABASE_TYPE`, missing -> `d1`):
 *   - `d1`        -> `"../db/sqlite-client"` (sqlite is the closest local driver)
 *   - `sqlite`    -> `"../db/sqlite-client"`
 *   - `postgres`  -> `"../db/postgres-client"`
 *   - `neon`      -> `"../db/postgres-client"` (same driver as postgres)
 *   - `turso`     -> `"../db/turso-client"`
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
 * The client module specifier for the active dialect — inlined at build time.
 * `d1` maps to the sqlite client (closest local driver). Import the result
 * statically: `const mod = await import(clientModule())`.
 */
export function clientModule(): string {
	switch (dbDialect()) {
		case "postgres":
		case "neon":
			return "../db/postgres-client";
		case "turso":
			return "../db/turso-client";
		case "sqlite":
		case "d1":
		default:
			return "../db/sqlite-client";
	}
}
