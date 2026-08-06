/**
 * Dialect-aware test runner.
 *
 * Determines the active `DATABASE_TYPE` and runs the matching endpoint tests
 * with the db-type-specific dev env (`.env.dev.<type>`), which is overridable
 * with `--env-file=<file>`.
 *
 *   - `sqlite` / `d1`        -> `movies.test.ts`          + `.env.dev`
 *   - `postgres` / `neon`    -> `movies-postgres.test.ts` + `.env.dev.postgres`
 *   - `turso`                -> `movies-turso.test.ts`    + `.env.dev.turso`
 *
 * Usage:
 *   bun run test                        # tests for the active DATABASE_TYPE
 *   bun run test --env-file=.env.neon   # override the env file
 *   bun run test -- --run <file>        # pass extra args to `bun test`
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { dbDialect } from "../src/macros/db-dialect" with { type: "macro" };

const root = resolve(import.meta.dir, "..");

// Default `d1` is handled by the macro's sqlite normalization in the map below
// (sqlite and d1 share the same test file). This keeps the macro reusable.
const dialect = dbDialect();

// Test file + default dev env per dialect.
const testTargets: Record<string, { file: string; env: string }> = {
	sqlite: { file: "src/routes/movies.test.ts", env: ".env.dev" },
	d1: { file: "src/routes/movies.test.ts", env: ".env.dev.d1" },
	postgres: { file: "src/routes/movies-postgres.test.ts", env: ".env.dev.postgres" },
	neon: { file: "src/routes/movies-postgres.test.ts", env: ".env.dev.neon" },
	turso: { file: "src/routes/movies-turso.test.ts", env: ".env.dev.turso" },
};

const target = testTargets[dialect] ?? testTargets["sqlite"]!;

// `--env-file=<file>` override; otherwise default to the dialect's dev env.
const envFlagArg = process.argv.find((a) => a.startsWith("--env-file="));
const envFile = envFlagArg
	? envFlagArg.slice("--env-file=".length)
	: target.env;

// Remaining args (minus --env-file) pass through to `bun test`.
const restArgs = process.argv
	.slice(2)
	.filter((a) => !a.startsWith("--env-file="));

const envFileResolved = resolve(root, envFile);
if (!existsSync(envFileResolved)) {
	console.error(`Env file not found: ${envFile}`);
	process.exit(1);
}

console.log(`[test] dialect=${dialect} → test=${target.file} env-file=${envFile}`);
const args = ["--env-file", envFile, "test", target.file, ...restArgs];
const result = spawnSync("bun", args, { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
