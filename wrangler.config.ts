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
 *   - `DATABASE_TYPE`    -> `d1` keeps the top-level D1 binding; `neon` / `turso`
 *                            use their own environment with the DB binding(s).
 *   - `D1_DATABASE_ID`   -> top-level D1 binding `database_id`
 *   - `HYPERDRIVE_ID`    -> `neon` env Hyperdrive binding `id`
 *   - `TURSO_URL` + `TURSO_AUTH_TOKEN` -> `turso` env vars (Cloud Worker uses
 *     `@libsql/client/web`). Prefer `wrangler secret put TURSO_AUTH_TOKEN` in prod.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Unstable_RawConfig as Config } from "wrangler";

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

/**
 * Build the wrangler config object from env values (no filesystem writes).
 *
 * Dialect-pure:
 *   - `DATABASE_TYPE=neon` -> Neon-only: `env.neon` with a Hyperdrive binding,
 *     and NO top-level D1 settings.
 *   - otherwise (`d1`)     -> D1-only: top-level D1 binding and NO Hyperdrive.
 *
 * Strongly typed via the `Config` type from `wrangler`.
 */
export function buildWranglerConfig(
	env: Record<string, string>,
	overrides: Partial<Record<string, string>> = {},
): Config {
	const val = (key: string) => overrides[key] || env[key] || process.env[key] || "";
	const dialect = (val("DATABASE_TYPE") || "d1").toLowerCase();
	const isNeon = dialect === "neon";
	const isTurso = dialect === "turso" || dialect === "turso-cloud" || dialect === "tursodb";
	const d1Id = val("D1_DATABASE_ID");
	const hdId = val("HYPERDRIVE_ID");
	const tursoUrl = val("TURSO_URL");

	const config: Config = isNeon
		? {
				name: "movies-worker",
				main: "src/worker.ts",
				compatibility_date: "2026-08-06",
				compatibility_flags: ["nodejs_compat"],
				observability: { enabled: true },
				env: {
					neon: {
						name: "movies-worker-neon",
						hyperdrive: [
							{
								binding: "HYPERDRIVE",
								id: hdId || "REPLACE_WITH_YOUR_HYPERDRIVE_ID",
							},
						],
					},
				},
			}
		: isTurso
			? {
					name: "movies-worker",
					main: "src/worker.ts",
					compatibility_date: "2026-08-06",
					compatibility_flags: ["nodejs_compat"],
					observability: { enabled: true },
					env: {
						turso: {
							name: "movies-worker-turso",
							// TURSO_AUTH_TOKEN is set as a Worker SECRET
							// (`wrangler secret put TURSO_AUTH_TOKEN --env=turso`),
							// so only the non-sensitive URL lives in vars.
							vars: {
								TURSO_URL:
									tursoUrl || "REPLACE_WITH_YOUR_TURSO_URL",
							},
						},
					},
				}
			: {
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
				};
	return config;
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
	if (!(fileEnv["TURSO_URL"] || process.env["TURSO_URL"]))
		missing.push("TURSO_URL");
	if (!(fileEnv["TURSO_AUTH_TOKEN"] || process.env["TURSO_AUTH_TOKEN"]))
		missing.push("TURSO_AUTH_TOKEN");
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
