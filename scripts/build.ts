import bun from "@ttsc/unplugin/bun";

// Programmatic Bun.build() so the typia transform (configured in tsconfig.json
// via the `typia/lib/transform` plugin and applied by @ttsc/unplugin) runs
// during bundling. The bare `bun build` CLI cannot load transform plugins, so
// this script wires the plugin in explicitly.
const result = await Bun.build({
	entrypoints: ["src/main.ts"],
	outdir: "dist",
	target: "bun",
	format: "esm",
	sourcemap: "linked",
	plugins: [bun()],
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
console.log(`Built ${result.outputs.length} file(s) to dist/`);
