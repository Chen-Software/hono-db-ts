/**
 * wrangler.config — generate `wrangler.jsonc` from the configured environment.
 *
 * This is the SINGLE source of truth for the Worker config. It uses the
 * build-time macros (`databaseType()`, `env()`, `d1Database()`, `r2Bucket()`,
 * `workerUrl()`, `allowedOrigin()`) so the generated file adapts to the
 * selected `DATABASE_TYPE`:
 *
 *   - `DATABASE_TYPE=sqlite` (default dev/prod-in-memory) → no D1 binding.
 *   - `DATABASE_TYPE=d1`      → adds the `d1_databases` binding (`env.DB`,
 *     database name from `D1_DATABASE` / `db`).
 *   - `DATABASE_TYPE=turso`   → no D1 binding (external libSQL).
 *
 * `nodejs_compat` is always enabled: the Honox UI worker (`dist/ui-cf/index.js`)
 * imports `node:async_hooks` (via honox/Hono) regardless of the database type.
 *
 * Usage:
 *   bun run wrangler.config.ts                 # writes ./wrangler.jsonc
 *   bun run src/main.ts wrangler-config        # same, via the CLI
 *   bun run src/main.ts generate               # models + migrations + config + build
 *
 * The macros are Bun compile-time macros (`with { type: "macro" }`), so the
 * values are inlined at build time — run with the target env file loaded
 * (e.g. `NODE_ENV=production bun run src/main.ts wrangler-config`).
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
	allowedOrigin,
	betterAuthUrl,
	d1Database,
	d1DatabaseId,
	databaseType,
	env,
	isD1,
	r2Bucket,
	workerUrl,
} from "./src/macros/envs" with { type: "macro" };

export interface WranglerConfig {
	$schema: string;
	name: string;
	// Force the Cloudflare account (CF_ACCOUNT_ID). Wrangler otherwise auto-picks
	// from the OAuth token, which can select a stale/different account.
	account_id?: string;
	main: string;
	compatibility_date: string;
	compatibility_flags: string[];
	// Static assets (Workers Static Assets). The honox manifest emits URLs like
	// `/static/*` and `/favicon.ico`, so the assets directory must be `dist` —
	// Workers Static Assets maps the directory to the URL root, so `dist/static/*`
	// becomes `/static/*` and `dist/favicon.ico` becomes `/favicon.ico`.
	assets?: {
		directory: string;
		binding: string;
	};
	// D1 database binding — present ONLY when DATABASE_TYPE=d1.
	d1_databases?: Array<{
		binding: string;
		database_name: string;
		database_id: string;
		preview_database_id?: string;
		migrations_dir?: string;
	}>;
	// R2 binding — emitted when R2_ENABLED !== false and a bucket is configured.
	r2_buckets?: Array<{
		binding: string;
		bucket_name: string;
	}>;
	vars?: Record<string, string | undefined>;
}

/** Build the Worker config object for the current build-time env. */
export function buildWranglerConfig(): WranglerConfig {
	const type = databaseType();
	const prod = env() === "production";
	const d1 = isD1();
	const dbName = d1Database() ?? "bbs-db";

	const config: WranglerConfig = {
		$schema: "./node_modules/wrangler/config-schema.json",
		name: "bbs-query",
		// CF_ACCOUNT_ID pins the target account (see the interface comment).
		account_id: process.env.CF_ACCOUNT_ID || undefined,
		// The Honox UI worker (`app/server.cf.ts` via `vite.ui.cf.config.ts`)
		// serves SSR HTML at `/` AND the JSON query app at `/api/...`.
		main: "dist/ui-cf/index.js",
		// Serve the built client assets. The honox manifest emits `/static/*`
		// URLs, and Workers Static Assets maps the assets directory to the URL
		// root — so `dist/static/*` → `/static/*` (and `dist/favicon.ico` →
		// `/favicon.ico`) requires the directory to be `dist`, not `dist/static`.
		assets: {
			directory: "dist",
			binding: "ASSETS",
		},
		compatibility_date: "2026-01-01",
		// nodejs_compat is ALWAYS required — the Honox UI worker bundle
		// (`dist/ui-cf/index.js`) imports `node:async_hooks` (via honox/Hono),
		// regardless of the database type.
		compatibility_flags: ["nodejs_compat"],
		vars: {
			ENVIRONMENT: env(),
			DATABASE_TYPE: type,
		},
	};

	if (d1) {
		// D1 binding — the migration SQL is applied by `wrangler d1 migrations
		// apply` from the drizzle/ dir. nodejs_compat stays enabled (UI worker).
		config.d1_databases = [
			{
				binding: "DB",
				database_name: dbName,
				// Real D1 database ID (D1_DATABASE_ID) or the placeholder; wrangler
				// needs the actual ID to bind (it does NOT auto-resolve by name).
				database_id: prod
					? (d1DatabaseId() ?? "00000000000000000000000000000000")
					: "local",
				preview_database_id: "local",
				migrations_dir: "./drizzle",
			},
		];
		config.vars = {
			...config.vars,
			DATABASE_URL: undefined,
		};
	} else {
		// sqlite / turso — the worker opens its own database (in-memory sqlite
		// or libSQL).
		config.vars = {
			...config.vars,
			DATABASE_URL:
				type === "sqlite" ? ":memory:" : (process.env.TURSO_URL ?? undefined),
		};
	}

	// R2 asset bucket — emitted when R2_ENABLED !== "false" and R2_BUCKET set.
	if (r2Bucket()) {
		config.r2_buckets = [{ binding: "ASSETS", bucket_name: r2Bucket()! }];
	}

	// Useful references, not credentials (secrets go to secret bindings).
	const refs = [
		["WORKER_URL", workerUrl()],
		["ALLOWED_ORIGIN", allowedOrigin()],
		// Better Auth public base URL — the auth endpoints are served under
		// /api/auth/*, so this is typically the worker's own URL. Read through the
		// `betterAuthUrl()` macro (inlined from BETTER_AUTH_URL at build time);
		// BETTER_AUTH_SECRET is a SECRET binding (never a var) — set it with
		// `wrangler secret put`.
		["BETTER_AUTH_URL", betterAuthUrl() ?? workerUrl()],
	];
	for (const [key, value] of refs) {
		if (value) config.vars![key] = value;
	}

	return config;
}

/** Render the config as pretty JSONC (comments preserved via block headers). */
export function renderWranglerConfig(config: WranglerConfig): string {
	const header = `// Generated by wrangler.config.ts (${new Date().toISOString()})
// DATABASE_TYPE=${config.vars?.DATABASE_TYPE} — ${config.d1_databases ? "D1 binding" : "no D1 binding"}
// Do not edit by hand: run \`bun run src/main.ts wrangler-config\` to regenerate.
`;
	return `${header}${JSON.stringify(config, null, "\t")}\n`;
}

if (import.meta.main) {
	const config = buildWranglerConfig();
	const out = resolve(import.meta.dir, "wrangler.jsonc");
	writeFileSync(out, renderWranglerConfig(config));
	console.log(
		`wrangler-config: wrote ${out} (DATABASE_TYPE=${config.vars?.DATABASE_TYPE}${
			config.d1_databases ? ", D1 binding present" : ""
		})`,
	);
}
