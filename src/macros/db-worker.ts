/**
 * Build-time Worker backend selection via Bun macros.
 *
 * Import with `with { type: "macro" }`. The macro runs **once at build time**
 * and inlines a **string literal**: the module specifier of the active
 * dialect's Worker factory. The consumer (`src/worker.ts`) does a single static
 * `await import(<literal>)`, so the bundler resolves it at build time and
 * **tree-shakes away every other backend** — a `turso` Worker build ships only
 * the Turso factory and driver, never the Neon/Postgres or D1 ones, and vice
 * versa.
 *
 * Each target module exports `createReposFromEnv(env): Repos` (see
 * `src/worker/{turso,neon,d1}.ts`). `src/worker.ts` has no runtime branch over
 * backends — the selected backend is decided entirely at build time.
 *
 * Mapping (`DATABASE_TYPE`, missing -> `d1`):
 *   - `turso`  -> `./worker/turso` (Turso Cloud via `@libsql/client/http`)
 *   - `neon`   -> `./worker/neon`  (serverless Postgres via Hyperdrive)
 *   - `d1`     -> `./worker/d1`    (D1 `env.DB`)
 *
 * NOTE: Wrangler bundles Workers with esbuild, which does **not** execute Bun
 * macros. The Worker must therefore be bundled by Bun (`bun run build` ->
 * `scripts/build.ts`) for this macro to take effect; `wrangler.jsonc` points
 * `main` at the prebuilt `dist/worker.js`.
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

/** The active Worker dialect — inlined at build time. */
export function workerDialect(): DbDialect {
	return normalizeDialect(process.env["DATABASE_TYPE"]);
}

/**
 * The Worker factory module specifier for the active dialect — inlined at build
 * time. Import it statically: `const m = await import(workerModule())`.
 */
export function workerModule(): string {
	switch (workerDialect()) {
		case "neon":
		case "postgres":
			return "./worker/neon";
		case "turso":
			return "./worker/turso";
		case "d1":
		case "sqlite":
		default:
			return "./worker/d1";
	}
}
