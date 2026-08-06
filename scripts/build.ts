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
 *   - `dist/worker.js` — Cloudflare Worker entry (`src/worker.ts`, target
 *     `browser`; Wrangler cannot run Bun macros, so this entry has none).
 *
 * Usage:
 *   bun run build                      # build with current env
 *   DATABASE_TYPE=postgres bun run build
 */

import { build, type BuildConfig } from "bun";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

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
	{
		name: "worker (Cloudflare)",
		entry: resolve(root, "src/worker.ts"),
		target: "browser",
		file: "worker.js",
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

console.log(`\nBuild complete → ${outdir}`);
