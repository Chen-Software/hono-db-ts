/**
 * Test runner — splits unit vs integration tests.
 *
 * - Unit tests live under tests/unit and are decoupled from DATABASE_TYPE;
 *   they always run.
 * - Integration tests live under tests/integration (grouped by db type) and are
 *   env-aware, using the db-type dev env (.env.dev.T). Only the current
 *   DATABASE_TYPE's integration folder runs, unless --all is given.
 *
 * File discovery is a recursive scan for .unit.test.ts / .integration.test.ts,
 * so adding or renaming test files needs no script change.
 *
 * Usage:
 *   bun run test                        # all unit + current-dialect integration
 *   bun run test --all                  # all unit + all integration
 *   bun run test --env-file=.env.neon   # override the integration dev env
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { dbDialect } from "../src/macros/db-dialect" with { type: "macro" };
import { devEnvFile } from "../src/macros/dev-env" with { type: "macro" };

const root = resolve(import.meta.dir, "..");
const isAll = process.argv.includes("--all");

// Active dialect + its integration tests folder (d1→sqlite, neon→postgres).
const dialect = dbDialect();
const folderByDialect: Record<string, string> = {
	sqlite: "integration/sqlite",
	d1: "integration/sqlite",
	postgres: "integration/postgres",
	neon: "integration/postgres",
	turso: "integration/turso",
};
const integrationFolder = folderByDialect[dialect] ?? "integration/sqlite";

// Recursively find files matching `*.test.ts` under a directory, relative to root.
function findTests(dirAbs: string): string[] {
	const out: string[] = [];
	function walk(dir: string): void {
		if (!existsSync(dir)) return;
		for (const entry of readdirSync(dir)) {
			const full = join(dir, entry);
			if (statSync(full).isDirectory()) {
				walk(full);
			} else if (entry.endsWith(".test.ts")) {
				out.push(relative(root, full).split("\\").join("/"));
			}
		}
	}
	walk(dirAbs);
	return out;
}

// Unit tests always run; integration tests run for the current dialect only
// (or all dialects with --all).
const unitFiles = findTests(resolve(root, "tests/unit"));
const integrationDir = resolve(root, `tests/${integrationFolder}`);
const integrationFiles = isAll
	? findTests(resolve(root, "tests/integration"))
	: findTests(integrationDir);

const files = [...unitFiles, ...integrationFiles].sort();

if (files.length === 0) {
	console.error("No test files found.");
	process.exit(1);
}

// Integration tests use the db-type dev env by default; `--env-file` overrides.
const envFlagArg = process.argv.find((a) => a.startsWith("--env-file="));
const envFile = envFlagArg
	? envFlagArg.slice("--env-file=".length)
	: devEnvFile();

const envFileResolved = resolve(root, envFile);
if (integrationFiles.length > 0 && !existsSync(envFileResolved)) {
	console.error(`Env file not found: ${envFile}`);
	process.exit(1);
}

// Remaining args (minus --all / --env-file) pass through to `bun test`.
const restArgs = process.argv
	.slice(2)
	.filter((a) => a !== "--all" && !a.startsWith("--env-file="));

console.log(
	`[test] dialect=${dialect} | unit=${unitFiles.length} ` +
		`integration=${integrationFiles.length} ${isAll ? "(--all)" : ""} ` +
		`env-file=${envFile}`,
);

const args = ["--env-file", envFile, "test", ...files, ...restArgs];
const result = spawnSync("bun", args, { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
