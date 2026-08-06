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
 *   bun run test                                  # all unit + current-dialect integration
 *   bun run test --all                            # all unit + all integration
 *   bun run test --unit                           # unit tests only
 *   bun run test --integration                    # current-dialect integration only
 *   bun run test --test <name>                    # only tests whose path contains <name>
 *   bun run test --env-file=.env.neon             # override the integration dev env
 *   bun run test --coverage                       # also emit coverage (text + lcov)
 *   bun run test --coverage --coverage-dir=coverage # coverage output dir (default coverage)
 *
 * --all cannot combine with --unit / --integration / --test;
 * --test cannot combine with --all / --unit / --integration.
 *
 * Per-file and total elapsed times are printed by bun's default reporter; this
 * script keeps a single spawn and surfaces them as-is.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { dbDialect } from "../src/macros/db-dialect" with { type: "macro" };
import { devEnvFile } from "../src/macros/dev-env" with { type: "macro" };

const root = resolve(import.meta.dir, "..");
const argv = process.argv.slice(2);

// Flag parsing.
const isAll = argv.includes("--all");
const isUnit = argv.includes("--unit");
const isIntegration = argv.includes("--integration");
const testFlagIdx = argv.indexOf("--test");
const testFilter = testFlagIdx !== -1 ? argv[testFlagIdx + 1] : undefined;
const withCoverage = argv.includes("--coverage");
const coverageDirArg = argv.find((a) => a.startsWith("--coverage-dir="));
const coverageDir = coverageDirArg
	? coverageDirArg.slice("--coverage-dir=".length)
	: undefined;

// Mutual exclusion: at most one of --all / --unit / --integration / --test.
const exclusiveFlags = [isAll, isUnit, isIntegration, testFilter !== undefined]
	.filter(Boolean).length;
if (exclusiveFlags > 1) {
	console.error(
		"--all, --unit, --integration and --test are mutually exclusive.",
	);
	process.exit(1);
}

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
const allIntegrationFiles = Object.values(integration).flat();
const currentIntegrationFiles = integration[active] ?? [];

// Build the selected file list from the active filter.
let files: string[];
let filterLabel: string;
if (testFilter !== undefined) {
	files = [...unitFiles, ...allIntegrationFiles].filter((f) =>
		f.includes(testFilter),
	);
	filterLabel = `--test "${testFilter}"`;
} else if (isAll) {
	files = [...unitFiles, ...allIntegrationFiles];
	filterLabel = "--all";
} else if (isUnit) {
	files = unitFiles;
	filterLabel = "--unit";
} else if (isIntegration) {
	files = currentIntegrationFiles;
	filterLabel = "--integration";
} else {
	files = [...unitFiles, ...currentIntegrationFiles];
	filterLabel = "default";
}
files.sort();

const selectedIntegrationFiles = files.filter((f) =>
	f.endsWith(".integration.test.ts"),
);

if (files.length === 0) {
	console.error(
		`No test files found for mode=${filterLabel}. ` +
			"Discovered files: " +
			`unit=${unitFiles.length}, ` +
			`integration=${JSON.stringify(
				Object.fromEntries(
					Object.entries(integration).map(([k, v]) => [k, v.length]),
				),
			)}. ` +
			"Tests are found by filename suffix under src: " +
			"`*.unit.test.ts` and `*.<db-type>.integration.test.ts`.",
	);
	process.exit(1);
}

// Integration tests use the db-type dev env by default; `--env-file` overrides.
// Only required when the selected set actually includes integration tests.
const envFlagArg = argv.find((a) => a.startsWith("--env-file="));
const envFile = envFlagArg
	? envFlagArg.slice("--env-file=".length)
	: devEnvFile();

const envFileResolved = resolve(root, envFile);
if (selectedIntegrationFiles.length > 0 && !existsSync(envFileResolved)) {
	console.error(`Env file not found: ${envFile}`);
	process.exit(1);
}

// Remaining args (minus our flags) pass through to `bun test`.
const skip = new Set([
	"--all",
	"--unit",
	"--integration",
	"--test",
	"--env-file",
	"--coverage",
	"--coverage-dir",
]);
const restArgs = argv.filter((a) => {
	if (a.startsWith("--env-file=")) return false;
	if (a.startsWith("--coverage-dir=")) return false;
	if (skip.has(a)) return false;
	if (testFlagIdx !== -1 && argv.indexOf(a) === testFlagIdx + 1) return false;
	return true;
});

// Coverage is opt-in via --coverage (reports text + lcov). lcov is emitted to
// the coverage dir so CI can pick it up.
const coverageArgs = withCoverage
	? [
			"--coverage",
			"--coverage-reporter=text,lcov",
			...(coverageDir ? [`--coverage-dir=${coverageDir}`] : []),
		]
	: [];

const integrationSummary = isAll
	? Object.entries(integration)
			.map(([k, v]) => `${k}:${v.length}`)
			.join(" ")
	: `${active}:${selectedIntegrationFiles.length}`;
console.log(
	`[test] dialect=${dialect} | mode=${filterLabel} | unit=${files.filter((f) => f.endsWith(".unit.test.ts")).length} ` +
		`integration=[${integrationSummary}] env-file=${envFile} ` +
		`coverage=${withCoverage ? "on" : "off"}`,
);

const args = [
	"--env-file",
	envFile,
	"test",
	...coverageArgs,
	...files,
	...restArgs,
];
const result = spawnSync("bun", args, { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
