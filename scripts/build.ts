/**
 * Build script — bundles the app with `Bun.build`.
 *
 * Run this locally or in CI **before deployment**. Bun's bundler executes the
 * Bun macros (`import ... with { type: "macro" }`, see `src/macros/*.ts`) at
 * build time, so `DATABASE_TYPE` / `DATABASE_URL` are read here and inlined as
 * literals into the emitted bundles — no runtime env parsing ships in the output.
 *
 * Emits to `dist/`:
 *   - `dist/server.js` — local Bun server entry (`src/main.ts`, target `bun`).
 *
 * Also (re)generates `wrangler.jsonc` from `.env` via `wrangler.config.ts`, so
 * a single `bun run build` produces everything the deploy step needs.
 *
 * The Cloudflare Worker is **not** bundled here: it has no Bun macros and needs
 * Wrangler's `nodejs_compat` (for `postgres-js` via Hyperdrive), so it is
 * bundled by `wrangler deploy` / `wrangler dev` from `src/worker.ts`.
 *
 * Usage:
 *   bun run build                      # build with current env
 *   DATABASE_TYPE=postgres bun run build
 */

import { build, type BuildConfig } from "bun";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { generateWranglerConfig } from "../wrangler.config";

const root = resolve(import.meta.dir, "..");
const outdir = resolve(root, "dist");

/** Nuke the previous output so stale artifacts never linger. */
rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

interface Job {
	name: string;
	entry: string;
	target: BuildConfig["target"];
	/** Output file name (relative to `outdir`). */
	file: string;
}

const jobs: Job[] = [
	{
		name: "server (local Bun)",
		entry: resolve(root, "src/main.ts"),
		target: "bun",
		file: "server.js",
	},
];

let failed = false;

for (const job of jobs) {
	const result = await build({
		entrypoints: [job.entry],
		outdir,
		target: job.target,
		format: "esm",
		minify: true,
		sourcemap: "external",
		naming: {
			// Keep the two entry bundles' names stable & predictable.
			entry: job.file,
		},
	});

	if (!result.success) {
		failed = true;
		console.error(`✗ ${job.name}`);
		for (const log of result.logs) {
			console.error(log);
		}
		continue;
	}

	console.log(`✓ ${job.name}`);
	for (const output of result.outputs) {
		console.log(`  ${output.path} (${output.size} bytes)`);
	}
}

if (failed) {
	console.error("\nBuild failed.");
	process.exit(1);
}

// Regenerate the wrangler config from .env so deployment always uses fresh IDs.
const missing = generateWranglerConfig();
if (missing.length) {
	console.warn(
		`⚠️  Missing env var(s): ${missing.join(", ")} — wrangler.jsonc uses placeholders. ` +
			`Set them in .env to deploy a real database.`,
	);
} else {
	console.log("✓ Generated wrangler.jsonc from .env");
}

console.log(`\nBuild complete → ${outdir}`);
