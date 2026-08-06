/**
 * Dialect-aware Cloudflare Workers deploy launcher, with optional pre/post
 * lifecycle hooks.
 *
 * Bun auto-loads `.env` into `process.env`, so `DATABASE_TYPE` (and the Turso /
 * Neon connection values) are already available here with no extra parsing. This
 * script then picks the right Wrangler **named environment** from that dialect
 * and runs `wrangler deploy`, optionally as a `--dry-run` (validate-only, no
 * upload).
 *
 *   - `turso`  -> `--env=turso`  (TURSO_URL var + TURSO_AUTH_TOKEN secret)
 *   - `neon`   -> `--env=neon`   (Hyperdrive binding)
 *   - `d1`     -> `--env=""`     (top-level D1 environment)
 *
 * ## Lifecycle
 *
 *   1. **Build** — runs the macros and (re)generates `wrangler.jsonc` from `.env`.
 *   2. **BEFORE hook** — if `BEFORE_DEPLOY_HOOK_SCRIPT` is set, run it. The hook
 *      may modify `.env` (e.g. mint a fresh Turso token), so we **re-run the
 *      build** afterwards so the wrangler config reflects the updated env.
 *   3. **Deploy** — `wrangler deploy` for the selected environment.
 *   4. **AFTER hook** — if `AFTER_DEPLOY_HOOK_SCRIPT` is set, run it (e.g. to
 *      revoke / scrub the temporary token from `.env`).
 *
 * A hook value is a shell command string, run in the project root with the
 * current environment. An empty value disables the hook. Any deploy CLI args
 * (e.g. `--dry-run`) are appended to the hook command so hooks can adapt (a
 * turso BEFORE hook skips token rotation on `--dry-run`).
 *
 * Usage:
 *   bun run scripts/deploy.ts               # build + deploy the active dialect
 *   bun run scripts/deploy.ts --dry-run     # build + validate only (no upload)
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

// All CLI args after the script name (e.g. `--dry-run`) are forwarded to the
// BEFORE/AFTER hooks, so a hook can adapt its behaviour (e.g. skip destructive
// steps on a dry-run).
const dryRun = process.argv.includes("--dry-run");
const hookArgs = process.argv.slice(2).join(" ");

/** Map the active dialect (from `.env`) to the Wrangler named environment. */
function deployEnv(dialect: string | undefined): string {
	switch (dialect) {
		case "turso":
		case "turso-cloud":
		case "tursodb":
			return "turso";
		case "neon":
			return "neon";
		case "d1":
		default:
			// `d1` (and anything unrecognised) uses the top-level environment.
			return "";
	}
}

/** Run a command in the project root, inheriting stdio. Exits on failure. */
function run(command: string, args: string[]): void {
	const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

/**
 * Run a lifecycle hook (shell command string) in the project root, if set.
 * The deploy CLI args (e.g. `--dry-run`) are appended so the hook can adapt.
 */
function runHook(name: string, script: string | undefined): void {
	if (!script || script.trim() === "") {
		console.log(`[deploy] ${name}: none (skipped)`);
		return;
	}
	const cmd = `${script} ${hookArgs}`.trim();
	console.log(`[deploy] ${name}: running \`${cmd}\``);
	const result = spawnSync(cmd, { cwd: root, stdio: "inherit", shell: true });
	if (result.status !== 0) {
		console.error(`[deploy] ${name} failed with exit code ${result.status ?? 1}`);
		process.exit(result.status ?? 1);
	}
}

const dialect = (process.env["DATABASE_TYPE"] ?? "d1").toLowerCase();
const envName = deployEnv(dialect);

console.log(`[deploy] DATABASE_TYPE=${dialect} → wrangler environment=${envName || "(default)"}`);

// 1. Build first: runs the macros and regenerates wrangler.jsonc from .env.
console.log("[deploy] building…");
run("bun", ["run", "build"]);

// 2. BEFORE hook — may update .env, so rebuild afterwards.
runHook("BEFORE_DEPLOY_HOOK_SCRIPT", process.env["BEFORE_DEPLOY_HOOK_SCRIPT"]);
if (process.env["BEFORE_DEPLOY_HOOK_SCRIPT"]) {
	console.log("[deploy] re-building after BEFORE hook (env may have changed)…");
	run("bun", ["run", "build"]);
}

// 3. Deploy (or validate) with the selected environment.
const wranglerArgs = ["x", "wrangler", "deploy"];
if (envName !== "") wranglerArgs.push(`--env=${envName}`);
if (dryRun) wranglerArgs.push("--dry-run");

console.log(`[deploy] ${dryRun ? "validating" : "deploying"} → bun ${wranglerArgs.join(" ")}`);
run("bun", wranglerArgs);

// 4. AFTER hook — e.g. revoke / scrub the temporary token from .env.
runHook("AFTER_DEPLOY_HOOK_SCRIPT", process.env["AFTER_DEPLOY_HOOK_SCRIPT"]);

console.log(`[deploy] done${dryRun ? " (dry-run — nothing uploaded)" : ""}.`);
