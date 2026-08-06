/**
 * Build-time database dialect resolution via Bun macros.
 *
 * Import with `with { type: "macro" }`. `dbDialect()` runs **once at build time**
 * (when `bun run dev` / a `scripts/*.ts` launches) and returns the normalized
 * dialect as an inlined literal:
 *
 *   - `postgres` / `postgresql` / `pg` -> `postgres`
 *   - `neon`                           -> `neon`
 *   - `turso` / `tursodb` / `turso-cloud` -> `turso`
 *   - `d1`                             -> `d1`
 *   - anything else / missing          -> `sqlite`
 *
 * The value is read from `process.env["DATABASE_TYPE"]` (auto-loaded from `.env`)
 * at build time. Because `neon ≡ postgres` and `d1 ≡ sqlite` are handled
 * identically by the consuming scripts, this stays correct even when a `--dev`
 * env file overrides the dialect to an equivalent one.
 */

import type { DbDialect } from "./db";

/** Normalize a raw dialect string into a canonical one. */
function normalizeDialect(raw: string | undefined): DbDialect {
	const type = (raw ?? "sqlite").toLowerCase();
	if (type === "postgres" || type === "postgresql" || type === "pg")
		return "postgres";
	if (type === "neon") return "neon";
	if (type === "turso" || type === "tursodb" || type === "turso-cloud")
		return "turso";
	if (type === "d1") return "d1";
	return "sqlite";
}

/** The active normalized dialect — inlined at build time. */
export function dbDialect(): DbDialect {
	return normalizeDialect(process.env["DATABASE_TYPE"]);
}
