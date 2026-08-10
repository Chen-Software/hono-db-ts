import bb from "@ttsc/unplugin/bun";

/**
 * Builds `src/cf-worker.ts` for Cloudflare Workers.
 *
 * Uses the same ttsc plugin as `scripts/build.ts` so the typia transform runs
 * at bundle time.  The output is standard ESM that Workers can load directly
 * (with `nodejs_compat` enabled).  `wrangler.jsonc` points at the built output
 * and is set to `no_bundle: true` so wrangler leaves the pre-transpiled file
 * untouched.
 */
const result = await Bun.build({
	entrypoints: ["src/cf-worker.ts"],
	outdir: "dist",
	target: "bun",
	format: "esm",
	sourcemap: "linked",
	plugins: [bb()],
	// Workers cannot load these native modules at runtime; mark them external
	// so any transitive import of bun:sqlite (e.g. by modules also used on the
	// CF path) is left as a bare specifier and Workers just ignores dead code.
	external: ["bun:sqlite"],
});

if (!result.success) {
	for (const log of result.logs) {
		console.error(log);
	}
	process.exit(1);
}

for (const output of result.outputs) {
	console.log(`  ${output.path}`);
}
console.log(`Built ${result.outputs.length} file(s) to dist/ (cf-worker)`);
