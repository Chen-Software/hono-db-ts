/**
 * Build script — bundles the app with `Bun.build`.
 *
 * Run this locally or in CI **before deployment**. Bun's bundler executes the
 * Bun macros (`import ... with { type: "macro" }`, see `src/macros/*.ts`) at
 * build time, so `DATABASE_TYPE` / `DATABASE_URL` are read here and inlined as
 * literals into the emitted bundles — no runtime env parsing ships in the output.
 *
 * Emits to `dist/`:
 *   - `dist/main.js` — local Bun server entry (`src/main.ts`, target `bun`).
 *   - `dist/worker.js` — Cloudflare Worker entry (`src/worker.ts`, target
 *     `browser`). Bundling it here under Bun lets the Worker use Bun macros
 *     (e.g. `src/macros/db-worker.ts`) so **only the active backend** is
 *     bundled — `wrangler.jsonc` points `main` at this prebuilt bundle.
 *
 * Entry points are discovered from the top level of `src/`:
 *   - include: every `src/*.ts`
 *   - exclude: `*.test.ts`, and library modules that are imported by entries
 *     rather than standalone bundles (e.g. `app.ts`, the shared Hono factory).
 * `main.ts` bundles for the local Bun runtime; `worker.ts` for the Worker
 * (browser) target. Any other discovered entry defaults to `bun`.
 *
 * Also (re)generates `wrangler.jsonc` from `.env` via `wrangler.config.ts`, so
 * a single `bun run build` produces everything the deploy step needs.
 *
 * Usage:
 *   bun run build                      # build with current env
 *   DATABASE_TYPE=postgres bun run build
 */

import { build, type BuildConfig } from "bun";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { generateWranglerConfig } from "../wrangler.config";

const root = resolve(import.meta.dir, "..");
const outdir = resolve(root, "dist");

/** Library modules under `src/` that are imported by entries, not bundled alone. */
const EXCLUDED_ENTRIES = new Set(["app.ts"]);

/** Map an entry file name to its build target (unknown -> local Bun). */
function entryTarget(file: string): BuildConfig["target"] {
	return file === "worker.ts" ? "browser" : "bun";
}

/** Map an entry file name to its stable output name. */
function outputName(file: string): string {
	return file.replace(/\.ts$/, ".js");
}

/** Discover top-level entry points in `src/` (include non-test, exclude libs). */
function discoverEntries(): string[] {
	return readdirSync(resolve(root, "src"))
		.filter(
			(f) =>
				f.endsWith(".ts") &&
				!f.endsWith(".test.ts") &&
				!EXCLUDED_ENTRIES.has(f),
		)
		.sort();
}

interface Job {
	name: string;
	entry: string;
	target: BuildConfig["target"];
	/** Output file name (relative to `outdir`). */
	file: string;
}

/** Build a single entry; returns true on success. */
async function buildJob(job: Job): Promise<boolean> {
	const result = await build({
		entrypoints: [job.entry],
		outdir,
		target: job.target,
		format: "esm",
		minify: true,
		sourcemap: "external",
		naming: {
			entry: job.file,
		},
	});

	if (!result.success) {
		console.error(`✗ ${job.name}`);
		for (const log of result.logs) {
			console.error(log);
		}
		return false;
	}

	console.log(`✓ ${job.name}`);
	for (const output of result.outputs) {
		console.log(`  ${output.path} (${output.size} bytes)`);
	}
	return true;
}

/** Nuke the previous output so stale artifacts never linger. */
rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const entryFiles = discoverEntries();
const jobs: Job[] = entryFiles.map((file) => ({
	name: file.replace(/\.ts$/, "") + (file === "worker.ts" ? " (Cloudflare Worker)" : " (local Bun)"),
	entry: resolve(root, "src", file),
	target: entryTarget(file),
	file: outputName(file),
}));

let failed = false;
for (const job of jobs) {
	if (!(await buildJob(job))) failed = true;
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
