/**
 * Test runner — splits unit vs integration tests, discovered by filename suffix.
 *
 * Tests live next to the code they exercise (under src). No central tests/
 * folder is needed; only the filename suffix matters:
 *
 * - `<name>.unit.test.ts`                — env-agnostic, run with NO --env-file, always run.
 * - `<name>.<db-type>.integration.test.ts` — env-aware, runs with the db-type dev
 *   env (`--env-file`), only when the active DATABASE_TYPE matches `<db-type>`,
 *   unless --all is given.
 *
 * Recursive scan means adding or renaming test files needs no script change.
 *
 * Usage:
 *   bun run test                                  # all unit + current-dialect integration
 *   bun run test --all                            # all unit + all integration
 *   bun run test --unit                           # unit tests only (no env file)
 *   bun run test --integration                    # current-dialect integration only
 *   bun run test --test <name>                    # only tests whose path contains <name>
 *   bun run test <file>...                        # only the given test files (e.g. src/routes/movies.unit.test.ts)
 *   bun run test --env-file=.env.neon             # override the integration dev env
 *   bun run test --coverage                       # also emit coverage (text + lcov)
 *   bun run test --coverage --coverage-dir=coverage # coverage output dir (default coverage)
 *   bun run test --timeout=30000                  # override the per-test timeout (ms)
 *
 * --all / --unit / --integration / --test are mutually exclusive with each
 * other and with explicit test-file paths.
 *
 * Timeouts (Bun `--timeout`): unit runs default to 10s, integration / mixed
 * runs to 30s; `--timeout=<ms>` overrides either.
 *
 * The env file may set `INTEGRATION_TEST_SETUP_SCRIPT` to a command run once
 * before integration tests (e.g. `docker compose up -d` for postgres/neon),
 * plus `INTEGRATION_TEST_SETUP_TIMEOUT` (ms, default 120s) to cap how long it
 * may run. d1 / turso / sqlite leave both unset.
 *
 * Per-file and total elapsed times are printed by bun's default reporter; this
 * script keeps a single spawn and surfaces them as-is.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { dbDialect } from "../src/macros/db-dialect" with { type: "macro" };
import { devEnvFile } from "../src/macros/dev-env" with { type: "macro" };

const root = resolve(import.meta.dir, "..");
const argv = process.argv.slice(2);

/** Read a single KEY=value from an env-style file (ignores comments/quotes). */
function readEnvValue(file: string, key: string): string | undefined {
	try {
		for (const line of readFileSync(file, "utf8").split("\n")) {
			const t = line.trim();
			if (!t || t.startsWith("#") || !t.includes("=")) continue;
			const eq = t.indexOf("=");
			if (t.slice(0, eq).trim() !== key) continue;
			let value = t.slice(eq + 1).trim();
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}
			return value;
		}
	} catch {
		// file may not exist
	}
	return undefined;
}

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
const timeoutArg = argv.find((a) => a.startsWith("--timeout="));
const timeoutOverride = timeoutArg
	? timeoutArg.slice("--timeout=".length)
	: undefined;

// Any bare positional arg that names a `.test.ts` file is an explicit file
// filter (highest priority): only those files run, matching `bun test <file>`.
const explicitFiles = argv.filter((a) => a.endsWith(".test.ts"));

// Mutual exclusion: at most one of --all / --unit / --integration / --test.
const modeFlags = [isAll, isUnit, isIntegration, testFilter !== undefined]
	.filter(Boolean).length;
if (modeFlags > 1) {
	console.error(
		"--all, --unit, --integration and --test are mutually exclusive.",
	);
	process.exit(1);
}
if (explicitFiles.length > 0 && modeFlags > 0) {
	console.error(
		"Explicit test-file paths cannot be combined with " +
			"--all / --unit / --integration / --test.",
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
if (explicitFiles.length > 0) {
	// Resolve explicit paths against the discovered set (accept either the
	// full `src/...` path or a bare `routes/movies.unit.test.ts`).
	const allFiles = [...unitFiles, ...allIntegrationFiles];
	files = explicitFiles.map((p) => {
		const normalized = p.split("\\").join("/").replace(/^\.\//, "");
		const match = allFiles.find(
			(f) => f === normalized || f.endsWith(`/${normalized}`),
		);
		return match ?? normalized;
	});
	filterLabel = "files";
} else if (testFilter !== undefined) {
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

// Only integration tests need an env file; unit tests are env-agnostic and run
// with no --env-file. The db-type dev env is used by default; `--env-file`
// overrides it. Unit-only runs skip the env file entirely.
const hasIntegration = selectedIntegrationFiles.length > 0;
const envFlagArg = argv.find((a) => a.startsWith("--env-file="));
const envFile = envFlagArg
	? envFlagArg.slice("--env-file=".length)
	: devEnvFile();

const envFileResolved = resolve(root, envFile);
if (hasIntegration && !existsSync(envFileResolved)) {
	console.error(`Env file not found: ${envFile}`);
	process.exit(1);
}

// Per-category per-test timeout (Bun `--timeout=<ms>`). Defaults vary by mode:
// unit tests are fast; integration / mixed runs get a larger budget for DB I/O.
// `--timeout=<ms>` overrides the default.
const defaultTimeout = isUnit ? 10_000 : 30_000;
const timeoutMs = timeoutOverride ?? String(defaultTimeout);

// Optional integration-test setup command + its timeout, read from the loaded
// env file. For postgres/neon, INTEGRATION_TEST_SETUP_SCRIPT is
// `docker compose up -d` and INTEGRATION_TEST_SETUP_TIMEOUT (ms) caps how long
// it may run; d1/turso/sqlite leave both unset.
const setupScript = hasIntegration
	? readEnvValue(envFileResolved, "INTEGRATION_TEST_SETUP_SCRIPT")
	: undefined;
const setupTimeoutRaw = hasIntegration
	? readEnvValue(envFileResolved, "INTEGRATION_TEST_SETUP_TIMEOUT")
	: undefined;
const setupTimeoutMs = Number(setupTimeoutRaw ?? "120000");
const setupTimeout =
	Number.isFinite(setupTimeoutMs) && setupTimeoutMs > 0 ? setupTimeoutMs : 120_000;

// Remaining args (minus our flags) pass through to `bun test`.
const skip = new Set([
	"--all",
	"--unit",
	"--integration",
	"--test",
	"--env-file",
	"--coverage",
	"--coverage-dir",
	"--timeout",
]);
const restArgs = argv.filter((a) => {
	if (a.startsWith("--env-file=")) return false;
	if (a.startsWith("--coverage-dir=")) return false;
	if (a.startsWith("--timeout=")) return false;
	if (skip.has(a)) return false;
	if (a.endsWith(".test.ts")) return false; // consumed as explicit file filter
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
		`integration=[${integrationSummary}] env-file=${hasIntegration ? envFile : "none"} ` +
		`coverage=${withCoverage ? "on" : "off"} timeout=${timeoutMs}ms` +
		(setupScript ? ` setup="${setupScript}"` : ""),
);

// Run the optional integration setup (e.g. `docker compose up -d`) before tests,
// with a bounded timeout so a stuck setup can't hang the whole run.
if (setupScript) {
	console.log(`[test] running setup (${setupTimeout}ms timeout): ${setupScript}`);
	const setup = spawnSync(setupScript, {
		cwd: root,
		stdio: "inherit",
		shell: true,
		timeout: setupTimeout,
	});
	if (setup.error || setup.signal || setup.status !== 0) {
		console.error("\n[test] integration setup failed:");
		if (setup.error) console.error(`  error: ${setup.error.message}`);
		if (setup.signal === "SIGTERM") {
			console.error(
				`  timed out after ${setupTimeout}ms — the command did not finish.\n` +
					"  Likely causes & fixes:\n" +
					"    - Docker daemon not running -> start Docker Desktop / colima, then retry.\n" +
					"    - First image pull is slow  -> run `docker compose pull` once, then retry.\n" +
					"    - Port 5432 already in use   -> `lsof -i :5432` to find the process.\n" +
					"  Raise the budget via INTEGRATION_TEST_SETUP_TIMEOUT in the env file, or\n" +
					"  skip setup by removing INTEGRATION_TEST_SETUP_SCRIPT.",
			);
		} else if (setup.status !== 0) {
			console.error(`  exited with status ${setup.status}`);
		}
		process.exit(setup.status ?? 1);
	}
}

// NOTE: `--env-file` MUST come AFTER `test`. If it precedes the `test`
// subcommand, Bun treats `test` as a package script name (the `test` script in
// package.json) and recurses into this script infinitely. Unit-only runs pass no
// --env-file at all — unit tests are env-agnostic.
const args = [
	"test",
	`--timeout=${timeoutMs}`,
	...(hasIntegration ? [`--env-file=${envFile}`] : []),
	...coverageArgs,
	...files,
	...restArgs,
];
const result = spawnSync("bun", args, { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
