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
 * Before integration tests the runner runs `INTEGRATION_TEST_SETUP_SCRIPT` if
 * set (env file or CI env). It may be a `.ts` path (run via `bun run`), a
 * `.sh`/`.bash` path (run via `bash`), or an inline shell command. Cap its
 * runtime with `INTEGRATION_TEST_SETUP_TIMEOUT` (ms, default 120s) and disable
 * with `INTEGRATION_TEST_SETUP_SKIP=1`. A ready-to-use Postgres setup is
 * `scripts/postgres-container-setup.ts` (detects the container runtime and runs
 * `<runtime> compose up -d`). d1 / turso / sqlite run no setup.
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

// Re-exec this script with the dev env loaded via Bun's `--env-file` (unless an
// explicit --env-file was already given or we've already loaded it). `bun run
// scripts/test.ts` auto-loads only `.env`; the dev env (e.g. `.env.dev.turso`)
// carries the per-dialect setup vars (INTEGRATION_TEST_SETUP_*) and DB config.
// By loading it into THIS process through Bun, we avoid manually reading env
// files — `process.env` then holds everything.
const explicitEnvFlag = argv.find((a) => a.startsWith("--env-file="));
if (!explicitEnvFlag && !process.env["__TEST_DEV_ENV_LOADED__"]) {
	const devEnv = devEnvFile(); // macro -> literal dev env path
	// Start a child with a CLEAN env (system vars + marker only) — NOT this
	// process's env, which auto-loaded production `.env` (e.g. a TURSO_URL
	// placeholder). With a clean env, Bun loads `.env` then applies --env-file
	// AFTER it, so the dev values win. The child re-runs this script with the
	// dev env loaded (marker prevents another re-exec).
	const r = spawnSync(
		"bun",
		["run", `--env-file=${devEnv}`, import.meta.path, ...argv],
		{ cwd: root, stdio: "inherit", env: { ...buildCleanEnv(), __TEST_DEV_ENV_LOADED__: "1" } },
	);
	process.exit(r.status ?? 1);
}

/**
 * A minimal env with only system vars — used for spawning Bun subprocesses so
 * that `--env-file` (not an inherited, `.env`-polluted process.env) decides the
 * DB/config vars. Keeps the common system vars a script needs.
 */
function buildCleanEnv(): Record<string, string> {
	const pick = (...keys: string[]) => {
		const o: Record<string, string> = {};
		for (const k of keys) {
			const v = process.env[k];
			if (v !== undefined) o[k] = v;
		}
		return o;
	};
	return pick("PATH", "HOME", "SHELL", "USER", "TERM", "LANG", "LC_ALL", "PWD");
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

// Optional integration-test setup, only relevant when integration tests are
// selected. INTEGRATION_TEST_SETUP_SCRIPT may be:
//   - a path to a `.ts` file   -> run via `bun run <path>`
//   - a path to a `.sh`/`.bash`-> run via `bash <path>`
//   - any other string         -> run as an inline shell command (`sh -c`)
// Set INTEGRATION_TEST_SETUP_SKIP=1 to disable, and
// INTEGRATION_TEST_SETUP_TIMEOUT (ms) to cap how long it may run.
//
// The script re-executed itself with `--env-file=<devEnv>` at the top, so the
// dev env vars are already in process.env — no manual env-file reading needed.
const setupSkip = process.env["INTEGRATION_TEST_SETUP_SKIP"];
const setupValue = process.env["INTEGRATION_TEST_SETUP_SCRIPT"];
const setupTimeoutRaw = process.env["INTEGRATION_TEST_SETUP_TIMEOUT"];
const setupTimeoutMs = Number(setupTimeoutRaw ?? "120000");
const setupTimeout =
	Number.isFinite(setupTimeoutMs) && setupTimeoutMs > 0 ? setupTimeoutMs : 120_000;

// Turn the env value into a runnable command line.
let setupScript: string | undefined;
if (hasIntegration && setupSkip !== "1" && setupSkip !== "true" && setupValue) {
	const p = setupValue.trim();
	if (p.endsWith(".ts")) {
		setupScript = `bun run ${p}`;
	} else if (p.endsWith(".sh") || p.endsWith(".bash")) {
		setupScript = `bash ${p}`;
	} else {
		setupScript = p;
	}
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

// Run the optional integration setup (from INTEGRATION_TEST_SETUP_SCRIPT) before
// tests, with a bounded timeout so a stuck setup can't hang the whole run.
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
					"    - The container daemon isn't running (start Docker Desktop / colima / podman, or the `container` service).\n" +
					"    - First image pull is slow  -> run `<runtime> compose pull` once, then retry.\n" +
					"    - Port 5432 already in use   -> `lsof -i :5432` to find the process.\n" +
					"  Raise the budget via INTEGRATION_TEST_SETUP_TIMEOUT in the env file, or\n" +
					"  skip setup with INTEGRATION_TEST_SETUP_SKIP=1.",
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
//
// The child runs in a clean env with `--env-file=<envFile>`, so Bun's own env
// loading (`.env` then `--env-file`, with --env-file winning) provides the
// correct dev config — production `.env` values never leak in. Unit-only runs
// pass no --env-file and get the clean env too.
const args = [
	"test",
	`--timeout=${timeoutMs}`,
	...(hasIntegration ? [`--env-file=${envFile}`] : []),
	...coverageArgs,
	...files,
	...restArgs,
];

const result = spawnSync("bun", args, {
	cwd: root,
	stdio: "inherit",
	env: buildCleanEnv(),
});
process.exit(result.status ?? 1);
