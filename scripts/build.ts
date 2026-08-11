import { watch } from "node:fs";
import bun from "@ttsc/unplugin/bun";

// Programmatic Bun.build() so the typia transform (configured in tsconfig.json
// via the `typia/lib/transform` plugin and applied by @ttsc/unplugin) runs
// during bundling. The bare `bun build` CLI cannot load transform plugins, so
// this script wires the plugin in explicitly.
async function doBuild() {
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
		return false;
	}

	for (const output of result.outputs) {
		console.log(`  ${output.path}`);
	}
	console.log(`Built ${result.outputs.length} file(s) to dist/`);
	return true;
}

if (process.argv.includes("--watch")) {
	console.log("Watching src/ for changes...");
	await doBuild();
	watch("src", { recursive: true }, async (event, filename) => {
		if (filename && (filename.endsWith(".ts") || filename.endsWith(".json"))) {
			console.log(`File changed: ${filename}. Rebuilding...`);
			await doBuild();
		}
	});
} else {
	const ok = await doBuild();
	if (!ok) {
		process.exit(1);
	}
}
