import { resolve } from "node:path";
import bun from "@ttsc/unplugin/bun";
// NOTE: import the MACRO module directly (`@/macros/envs`), NOT the `@/macros`
// barrel. Bun throws `export from cannot be used with "type": "macro"`, so the
// re-export barrel cannot be consumed with `type: "macro"`.
import { env, databaseType } from "@/macros/envs" with { type: "macro" };

const root = resolve(import.meta.dir, "..");

console.log(
	`[env] building for NODE_ENV=${env()} DATABASE_TYPE=${databaseType()}`,
);

// Programmatic Bun.build() so the typia transform (configured in tsconfig.json
// via the `typia/lib/transform` plugin and applied by @ttsc/unplugin) runs
// during bundling. The bare `bun build` CLI cannot load transform plugins, so
// this script wires the plugin in explicitly.
const result = await Bun.build({
	entrypoints: [resolve(root, "src/main.ts")],
	outdir: resolve(root, "dist"),
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
