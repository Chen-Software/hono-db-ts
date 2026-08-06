/**
 * Build-time database configuration via Bun macros.
 *
 * Import these with `with { type: "macro" }` (or `assert { type: "macro" }`).
 * The function bodies run **once at build time** — when you run `bun run dev`,
 * `bun run build`, or on CI — and their return values are inlined into the
 * emitted code as literal AST nodes. That means:
 *
 *   - `process.env` is read at build time, not at runtime.
 *   - The dialect value is a compile-time constant, so a `switch`/`if` over it
 *     is fully folded and the untaken branch is dropped by the bundler.
 *   - No runtime env parsing or dialect detection ships in the output.
 *
 * Build-time env vars
 * -------------------
 * - `DATABASE_TYPE` — `sqlite` | `postgres` | `neon` | `d1` (default `sqlite`).
 * - `DATABASE_URL`  — connection URL for `sqlite`/`postgres`/`neon`.
 * - `DATABASE_POOL_SIZE` — postgres/neon pool size (default `10`).
 *
 * The macros run locally or in CI — never on the Cloudflare Worker. The Worker
 * entry (`src/worker.ts`) is a separate file with no macros at all; Wrangler
 * bundles it directly and the app reads the D1 binding (`env.DB`) at runtime.
 * See `src/db/index.ts` for how the local dialect factory consumes these macros.
 */

const DEFAULT_SQLITE_URL = "sqlite.db";
const DEFAULT_PG_URL = "postgres://postgres:postgres@localhost:5432/mydb";

type DbDialect = "sqlite" | "postgres" | "neon" | "d1";

function normalizeDialect(raw: string | undefined): DbDialect {
	const type = (raw ?? "sqlite").toLowerCase();
	if (type === "postgres" || type === "postgresql" || type === "pg")
		return "postgres";
	if (type === "neon") return "neon";
	if (type === "d1") return "d1";
	if (type === "sqlite") return "sqlite";
	// Unknown values fall back to SQLite rather than throwing at bundle time.
	return "sqlite";
}

/** Resolved dialect ("sqlite" | "postgres" | "neon" | "d1") — inlined at build time. */
export function dialect(): DbDialect {
	return normalizeDialect(process.env["DATABASE_TYPE"]);
}

/** Resolved `DATABASE_URL`, or the dialect-appropriate default. */
export function databaseUrl(): string {
	const url = process.env["DATABASE_URL"];
	if (url) return url;
	if (dialect() === "postgres" || dialect() === "neon") return DEFAULT_PG_URL;
	return DEFAULT_SQLITE_URL;
}

/** Whether the build targets the local Postgres dialect. */
export function isPostgres(): boolean {
	return dialect() === "postgres";
}

/** Whether the build targets the Neon (serverless Postgres) dialect. */
export function isNeon(): boolean {
	return dialect() === "neon";
}

/** Whether the build targets the Cloudflare D1 dialect. */
export function isD1(): boolean {
	return dialect() === "d1";
}

export type { DbDialect };
