/**
 * Build-time platform selection via Bun macros.
 *
 * Import with `with { type: "macro" }`. The predicate runs once at bundle time
 * and its boolean result is inlined, so `main.ts` can pick a repository
 * implementation at build time instead of branching at runtime.
 *
 * Detection strategy
 * ------------------
 * Bun's bundler sets `Bun.main` and exposes `Bun.env`. Wrangler builds run
 * under Node (esbuild) and never execute these macros, so their output is only
 * meaningful for Bun-generated bundles (e.g. `bun run build`). The `BUILD_TARGET`
 * env var gives an explicit, unambiguous override for tooling that wraps either
 * bundler; it defaults to the local Bun runtime.
 */

function target(): "bun" | "worker" {
	if (process.env["BUILD_TARGET"] === "worker") return "worker";
	return "bun";
}

/** True when bundling for the local Bun runtime (the default). */
export function isBunRuntime(): boolean {
	return target() === "bun";
}

/** True when bundling for the Cloudflare Worker runtime. */
export function isWorker(): boolean {
	return target() === "worker";
}
