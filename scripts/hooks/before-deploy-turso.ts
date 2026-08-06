/**
 * BEFORE_DEPLOY_HOOK_SCRIPT helper — rotates the Turso database token and sets
 * the fresh token as the Cloudflare Worker **secret** (never written to `.env`).
 *
 * Strategy: on every deploy we mint a fresh permanent token and store it as the
 * Worker's `TURSO_AUTH_TOKEN` secret, so the live Worker always holds a current
 * credential. Old tokens are invalidated so credentials don't accumulate.
 *
 * Turso databases live in a **group**; tokens are minted/invalidated at the
 * group level. This script resolves the group from `turso db list` and rotates
 * the group token:
 *
 *  1. `turso group tokens invalidate <group> -y`   # revoke old tokens (rotate keys)
 *  2. `turso group tokens create <group>`          # fresh token under new keys (never expires)
 *  3. `wrangler secret put TURSO_AUTH_TOKEN`       # set as Worker secret for --env=turso
 *
 * Order matters: `invalidate` rotates the group's signing keys (killing ALL
 * existing tokens), so it MUST run before we mint the replacement token —
 * otherwise the fresh token would be invalidated too and the Worker would break.
 *
 * When invoked with `--dry-run` (forwarded from `bun run deploy -- --dry-run`),
 * it does NOT mutate anything — it only validates connectivity (checks the Turso
 * auth and lists databases) so a dry-run deploy never rotates tokens.
 *
 * Requires the Turso CLI on PATH, an authenticated account (`turso auth
 * login`), and a logged-in Cloudflare session (`bun x wrangler login`).
 *
 * Usage (via deploy.ts):
 *   BEFORE_DEPLOY_HOOK_SCRIPT="bun run scripts/hooks/before-deploy-turso.ts"
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const envPath = resolve(root, ".env");

/** Read the current TURSO_URL from .env (or process.env). */
function readTursoUrl(): string {
	try {
		for (const line of readFileSync(envPath, "utf8").split("\n")) {
			const t = line.trim();
			if (t.startsWith("TURSO_URL=")) {
				return t.slice("TURSO_URL=".length).trim().replace(/^"|"$/g, "");
			}
		}
	} catch {
		// fall through to process.env
	}
	const url = process.env["TURSO_URL"];
	if (!url) throw new Error("TURSO_URL not found in .env or process.env");
	return url;
}

/**
 * Resolve the Turso database name and its group for a URL. Prefers an explicit
 * `TURSO_DB_NAME`; otherwise scans `turso db list` for the row whose URL
 * matches. Rows look like: NAME  TYPE  GROUP  URL.
 */
function resolveDb(url: string): { db: string; group: string } {
	if (process.env["TURSO_DB_NAME"]) {
		const list = execSync("turso db list", { encoding: "utf8" }).toString();
		for (const row of list.split("\n")) {
			const cols = row.trim().split(/\s+/);
			if (cols[0] === process.env["TURSO_DB_NAME"] && cols.length >= 3) {
				return { db: cols[0], group: cols[2] };
			}
		}
		throw new Error(
			`Cannot resolve group for TURSO_DB_NAME=${process.env["TURSO_DB_NAME"]}`,
		);
	}
	const list = execSync("turso db list", { encoding: "utf8" }).toString();
	for (const row of list.split("\n")) {
		const cols = row.trim().split(/\s+/);
		if (cols.length >= 3 && cols[cols.length - 1] === url) {
			return { db: cols[0], group: cols[2] };
		}
	}
	// Fall back to the pre-region host prefix as a last resort (group unknown).
	const match = /libsql:\/\/([^.]+)\./.exec(url);
	if (match) return { db: match[1], group: "" };
	throw new Error(`Cannot resolve Turso database for URL: ${url}`);
}

/** Run a command, inheriting stderr, and return its trimmed stdout. */
function runSync(command: string): string {
	return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] })
		.trim();
}

/** Set a Worker secret by piping the value to `wrangler secret put`. */
function setSecret(name: string, value: string): void {
	// value is piped on stdin so it never appears on the command line.
	execSync(`bun x wrangler secret put ${name} --env=turso`, {
		input: value,
		encoding: "utf8",
		stdio: ["pipe", "inherit", "inherit"],
	});
}

const url = readTursoUrl();
const { db, group } = resolveDb(url);
const envName = "turso";

// Dry-run mode: the deploy CLI forwarded `--dry-run` — validate connectivity
// only, do NOT rotate tokens or set secrets.
const dryRun = process.argv.includes("--dry-run");

console.log(
	`[hook:before-deploy-turso] ${dryRun ? "validating" : "rotating token"} for db \`${db}\` (group \`${group || "?"}\`)`,
);

if (dryRun) {
	// Just check the Turso account + DB are reachable and configured.
	console.log(`[hook:before-deploy-turso] (dry-run) checking Turso auth…`);
	runSync("turso auth whoami");
	console.log(`[hook:before-deploy-turso] (dry-run) listing databases…`);
	console.log(runSync("turso db list"));
	console.log(`[hook:before-deploy-turso] (dry-run) OK — no tokens rotated.`);
	process.exit(0);
}

// 1. Invalidate old tokens (rotates signing keys) BEFORE minting the new one.
if (group) {
	console.log(`[hook:before-deploy-turso] invalidating group \`${group}\` tokens…`);
	runSync(`turso group tokens invalidate ${group} -y`);
} else {
	console.log(`[hook:before-deploy-turso] invalidating db \`${db}\` tokens…`);
	runSync(`turso db tokens invalidate ${db} -y`);
}

// 2. Mint a fresh permanent token under the new keys.
const token = group
	? runSync(`turso group tokens create ${group}`)
	: runSync(`turso db tokens create ${db}`);
if (!token) throw new Error("Turso CLI returned no token");

// 3. Store it as the Cloudflare Worker secret (not in .env).
console.log(`[hook:before-deploy-turso] setting secret TURSO_AUTH_TOKEN for --env=${envName}…`);
setSecret("TURSO_AUTH_TOKEN", token);

console.log(
	`[hook:before-deploy-turso] deployed fresh TURSO_AUTH_TOKEN secret (${token.length} chars) to env \`${envName}\``,
);
