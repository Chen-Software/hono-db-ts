import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

const result = await Bun.build({
  entrypoints: [resolve(root, "src/main.ts")],
  outdir: resolve(root, "dist"),
  target: "bun",
  format: "esm",
  minify: true,
});

if (!result.success) {
  for (const message of result.logs) {
    console.error(message);
  }
  process.exit(1);
}

console.log("Build succeeded:");
for (const output of result.outputs) {
  console.log(`  ${output.path} (${(output.size / 1024).toFixed(2)} kB)`);
}
