/**
 * Test runner — splits unit vs integration tests, discovered by filename suffix.
 *
 * Tests live next to the code they exercise (under src). No central tests/
 * folder is needed; only the filename suffix matters:
 *
 * - `<name>.unit.test.ts`                — decoupled from DATABASE_TYPE, always run.
 * - `<name>.<db-type>.integration.test.ts` — env-aware, only runs when the active
 *   DATABASE_TYPE matches `<db-type>`, unless --all is given.
 *
 * Recursive scan means adding or renaming test files needs no script change.
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

// Active dialect. Unit tests always run; integration tests only for this dialect
// (or all dialects with --all). d1/neon map to their physical db type.
const dialect = dbDialect();
const canonical: Record<string, string> = {
	sqlite: "sqlite",
	d1: "sqlite",
	postgres: "postgres",
	neon: "postgres",
	turso: "turso",
};
const active = canonical[dialect] ?? "sqlite";

// Recursively find test files under src, relative to root.
// A file is classified by its suffix:
//   *.unit.test.ts                          -> unit
//   *.<db-type>.integration.test.ts         -> integration for that db-type
function findTests(dirAbs: string): {
	unit: string[];
	integration: Record<string, string[]>;
} {
	const unit: string[] = [];
	const integration: Record<string, string[]> = {};
	function walk(dir: string): void {
		if (!existsSync(dir)) return;
		for (const entry of readdirSync(dir)) {
			const full = join(dir, entry);
			if (statSync(full).isDirectory()) {
				walk(full);
				continue;
			}
			if (!entry.endsWith(".test.ts")) continue;
			const rel = relative(root, full).split("\\").join("/");
			if (entry.endsWith(".unit.test.ts")) {
				unit.push(rel);
			} else if (entry.endsWith(".integration.test.ts")) {
				// Extract the db-type token right before ".integration.test.ts".
				const base = entry.slice(0, -".integration.test.ts".length);
				const dot = base.lastIndexOf(".");
				const dbType = dot === -1 ? "" : base.slice(dot + 1);
				if (dbType) {
					(integration[dbType] ??= []).push(rel);
				}
			}
		}
	}
	walk(dirAbs);
	return { unit, integration };
}

const { unit: unitFiles, integration } = findTests(resolve(root, "src"));

const integrationFiles = isAll
	? Object.values(integration).flat()
	: (integration[active] ?? []);

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

const integrationSummary = isAll
	? Object.entries(integration)
			.map(([k, v]) => `${k}:${v.length}`)
			.join(" ")
	: `${active}:${integrationFiles.length}`;
console.log(
	`[test] dialect=${dialect} | unit=${unitFiles.length} ` +
		`integration=[${integrationSummary}] ${isAll ? "(--all)" : ""} ` +
		`env-file=${envFile}`,
);

const args = ["--env-file", envFile, "test", ...files, ...restArgs];
const result = spawnSync("bun", args, { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
