/**
 * Generates `wrangler.jsonc` from `.env` (and the process environment).
 *
 * Wrangler does not interpolate `${VAR}` for `d1` / Hyperdrive `id` fields, and
 * its native TypeScript-config loading is unreliable here. Instead this module
 * reads the env values and writes a ready-to-deploy `wrangler.jsonc`. It is
 * invoked by `scripts/build.ts` during `bun run build`, and can also be run
 * standalone:
 *
 *   bun run wrangler.config.ts          # standalone generator
 *   bun run generate:wrangler           # npm alias for the above
 *
 *   - `D1_DATABASE_ID`   -> top-level D1 binding `database_id`
 *   - `HYPERDRIVE_ID`    -> `neon` env Hyperdrive binding `id`
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, ".");

/** Parse a minimal .env file into a map (KEY=value, skips comments/blanks). */
export function loadEnv(path: string): Record<string, string> {
	const env: Record<string, string> = {};
	try {
		for (const line of readFileSync(path, "utf8").split("\n")) {
			const t = line.trim();
			if (!t || t.startsWith("#") || !t.includes("=")) continue;
			const i = t.indexOf("=");
			let v = t.slice(i + 1).trim();
			if (
				(v.startsWith('"') && v.endsWith('"')) ||
				(v.startsWith("'") && v.endsWith("'"))
			) {
				v = v.slice(1, -1);
			}
			env[t.slice(0, i).trim()] = v;
		}
	} catch {
		// .env may be missing; fall back to process.env.
	}
	return env;
}

/** Build the wrangler config object from env values (no filesystem writes). */
export function buildWranglerConfig(
	env: Record<string, string>,
	overrides: Partial<Record<string, string>> = {},
): Record<string, unknown> {
	const val = (key: string) => overrides[key] || env[key] || process.env[key] || "";
	const d1Id = val("D1_DATABASE_ID");
	const hdId = val("HYPERDRIVE_ID");

	return {
		$schema: "./node_modules/wrangler/config-schema.json",
		name: "movies-worker",
		main: "src/worker.ts",
		compatibility_date: "2026-08-06",
		compatibility_flags: ["nodejs_compat"],
		observability: { enabled: true },
		d1_databases: [
			{
				binding: "DB",
				database_name: "movies-db",
				database_id: d1Id || "REPLACE_WITH_YOUR_D1_DATABASE_ID",
			},
		],
		env: {
			neon: {
				name: "movies-worker-neon",
				// Clear the inherited top-level D1 binding so the neon worker only
				// carries the Hyperdrive binding.
				d1_databases: [],
				hyperdrive: [
					{
						binding: "HYPERDRIVE",
						id: hdId || "REPLACE_WITH_YOUR_HYPERDRIVE_ID",
					},
				],
			},
		},
	};
}

/**
 * Generate `wrangler.jsonc` in the project root from `.env`. Returns the set of
 * missing-but-referenced env keys (empty when all present).
 */
export function generateWranglerConfig(): string[] {
	const fileEnv = loadEnv(resolve(root, ".env"));
	const config = buildWranglerConfig(fileEnv);
	writeFileSync(
		resolve(root, "wrangler.jsonc"),
		JSON.stringify(config, null, 2) + "\n",
	);

	const missing: string[] = [];
	if (!(fileEnv["D1_DATABASE_ID"] || process.env["D1_DATABASE_ID"]))
		missing.push("D1_DATABASE_ID");
	if (!(fileEnv["HYPERDRIVE_ID"] || process.env["HYPERDRIVE_ID"]))
		missing.push("HYPERDRIVE_ID");
	return missing;
}

// Standalone execution: `bun run wrangler.config.ts`.
if (import.meta.main) {
	const missing = generateWranglerConfig();
	if (missing.length) {
		console.warn(
			`⚠️  Missing env var(s): ${missing.join(", ")} — using placeholders. ` +
				`Set them in .env to deploy a real database.`,
		);
	} else {
		console.log("✓ Generated wrangler.jsonc from .env");
	}
}
