import bun from "@ttsc/unplugin/bun";

/**
 * Bundle the smoke test with the typia transform applied (the models contain
 * `typia.*` calls that only become real functions at build time), then execute
 * the bundle. This is the same plugin wiring as `scripts/build.ts`, pointed at
 * `scripts/smoke-store.ts` instead of `src/main.ts`.
 */
const result = await Bun.build({
	entrypoints: ["scripts/smoke-store.ts"],
	outdir: "dist/smoke",
	target: "bun",
	format: "esm",
	plugins: [bun()],
});

if (!result.success) {
	for (const log of result.logs) console.error(log);
	process.exit(1);
}
for (const out of result.outputs) console.log(`  built ${out.path}`);

const url = new URL("../dist/smoke/smoke-store.js", import.meta.url);
await import(url.href);
