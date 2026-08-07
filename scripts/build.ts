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
 *   - `dist/worker.js` — the Cloudflare Worker bundle (`src/worker.ts`,
 *     target `node`). `src/worker/index.ts` resolves the active backend at
 *     build time via the `dialect` macro; `wrangler.jsonc` points `main` at
 *     this file. Wrangler uploads the prebuilt bundle — it must NOT re-bundle
 *     it with esbuild, which can't run Bun macros.
 *
 * The Worker is therefore **not** bundled by Bun here — Bun runs the macro to
 * pick the backend, and Wrangler does the actual Workers-compatible bundle.
 *
 * Entry points for the local Bun bundle are discovered from the top level of
 * `src/`: include every `src/*.ts`, exclude `*.test.ts` and library modules
 * imported by entries (e.g. `app.ts`).
 *
 * Also (re)generates `wrangler.jsonc` from `.env` via `wrangler.config.ts`, so
 * a single `bun run build` produces everything the deploy step needs.
 *
 * Usage:
 *   bun run build                      # build with current env
 *   DATABASE_TYPE=postgres bun run build
 */

import { build } from "bun";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { generateWranglerConfig } from "../wrangler.config";

const root = resolve(import.meta.dir, "..");
const outdir = resolve(root, "dist");

/** Library modules under `src/` that are imported by entries, not bundled alone. */
const EXCLUDED_ENTRIES = new Set(["app.ts"]);

/** Map an entry file name to its stable output name. */
function outputName(file: string): string {
	return file.replace(/\.ts$/, ".js");
}

/**
 * Discover local Bun entry points in `src/` (include non-test, exclude libs and
 * the Worker, which is bundled by Wrangler, not Bun).
 */
function discoverEntries(): string[] {
	return readdirSync(resolve(root, "src"))
		.filter(
			(f) =>
				f.endsWith(".ts") &&
				!f.endsWith(".test.ts") &&
				f !== "worker.ts" &&
				!EXCLUDED_ENTRIES.has(f),
		)
		.sort();
}

/**
 * Bundle the Cloudflare Worker with Bun into `dist/worker.js`.
 *
 * `src/worker.ts` uses the `db-worker` macro, which Bun executes here: the
 * active backend's module specifier is inlined and every other dialect's driver
 * is tree-shaken away. Wrangler uploads the prebuilt `dist/worker.js` (it must
 * NOT re-bundle it with esbuild, which can't run macros).
 */
async function buildWorker(): Promise<boolean> {
	const result = await build({
		entrypoints: [resolve(root, "src", "worker.ts")],
		outdir,
		// Cloudflare Workers run on V8 with `nodejs_compat`, so the `node` target
		// is used — it allows the node builtins (e.g. the `postgres` driver's
		// `tls`/`perf_hooks`) that `browser` rejects. SQLite-family dialects
		// (d1/turso) bundle fine under `node` too (no node builtins used).
		target: "node",
		format: "esm",
		minify: true,
		sourcemap: "external",
		naming: { entry: "worker.js" },
	});

	if (!result.success) {
		console.error(`✗ worker`);
		for (const log of result.logs) console.error(log);
		return false;
	}
	console.log(`✓ worker (Cloudflare Worker)`);
	for (const output of result.outputs) {
		console.log(`  ${output.path} (${output.size} bytes)`);
	}
	return true;
}

interface Job {
	name: string;
	entry: string;
	/** Output file name (relative to `outdir`). */
	file: string;
}

/** Build a single local Bun entry; returns true on success. */
async function buildJob(job: Job): Promise<boolean> {
	const result = await build({
		entrypoints: [job.entry],
		outdir,
		target: "bun",
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
	name: `${file.replace(/\.ts$/, "")} (local Bun)`,
	entry: resolve(root, "src", file),
	file: outputName(file),
}));

let failed = false;

// Build the Cloudflare Worker (Bun bundles src/worker.ts via the db-worker macro).
if (!(await buildWorker())) failed = true;

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
