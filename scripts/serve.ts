/**
 * serve — a local Hono HTTP server exposing the good BBS queries AND the
 * Honox UI.
 *
 *     bun run scripts/serve.ts [port] [mode]     (default :8787, mode=ui+api)
 *     PORT=3001 bun run src/main.ts serve [mode] (PORT env overrides the arg)
 *
 * Mode flag (positional or --mode=):
 *   ui+api   (default) UI at / + API at /api (errors if the UI isn't built).
 *   auto     UI at / + API at /api; if the UI isn't built, fall back to API at
 *            both / and /api (no error).
 *   api      JSON API at /api AND / (no UI). Use this when you only want the API.
 *   ui       UI only at / (no /api). Use this when you only want the UI.
 *
 * The Hono app lives in `src/http/app.ts` (`buildQueryApp`) and is reused by
 * the Cloudflare Worker (`src/worker.ts`); this script just binds it to a
 * `bun:sqlite` client and serves it with `Bun.serve`. Every endpoint queries
 * the SAME database the CLI `query` command and the `db:migrate`/`db:seed`
 * pipeline use, through the derived drizzle tables (`drizzle-orm/libsql` via
 * `src/db/client`, selected by the `databaseUrl()` macro) — the same derived
 * tables the app and Worker use. Response
 * shape is `{ ok: true, data }` or `{ ok: false, data: { error } }`.
 *
 * ## Serving the UI
 *
 * When `dist/index.js` exists (built with `bun run src/main.ts ui:build`), the
 * Honox UI in `/app` is mounted at the root (`/`) and the JSON query app under
 * `/api`. So the same port serves:
 *
 *   - `GET /`            — the Honox UI (SSR HTML, islands, /static/* assets)
 *   - `GET /api/stats` … — the "good BBS queries" JSON API
 *
 * If `dist/index.js` is missing, `serve` prints a hint and serves the JSON API
 * only (mounted at both `/` and `/api` for compatibility with existing clients).
 *
 * The `DATABASE_URL` target is resolved deliberately — it may be an in-memory
 * DB, a local file, or (in the Worker) a Cloudflare D1 / Turso remote:
 *
 *   - `:memory:` (or `sqlite::memory:`)        → in-memory, zero-setup
 *   - `file:./dev.db` / `./dev.db` / `dev.db`  → local file sqlite
 *   - `d1:<name>` / `d1://<name>`              → Cloudflare D1 (Worker only)
 *   - `libsql://…` / `DATABASE_TYPE=turso`     → Turso (external libSQL)
 *
 * Zero-setup: if the target has no tables (a fresh `:memory:` DB or an empty
 * file DB), the generated migration SQL from `drizzle/*.sql` is applied at
 * startup (see `src/http/schema.ts`). Existing data is preserved.
 *
 * D1 / Turso remotes cannot be opened by this local script (they live behind
 * the Worker's `env.DB` / libSQL binding) — `serve` prints a clear message and
 * exits; run the Worker instead (`bun run cf:build` + `wrangler dev`).
 *
 * Endpoints (the "good queries" for a BBS): /stats, /boards, /boards/:id,
 * /boards/:id/threads, /boards/:id/hot, /threads/:id, /threads/:id/replies,
 * /users/:id, /users/:id/threads, /users/:id/posts, /users/:id/replies,
 * /search, /latest-posts.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Hono } from "hono";
import type { Env } from "hono";
import { SQL } from "bun";

import {
	betterAuthEnabled,
	databaseType,
	databaseUrl,
} from "../src/macros/envs" with { type: "macro" };
import { buildQueryApp } from "../src/http/app";
import { resolveDatabaseTarget } from "../src/http/schema";
import { createQueryDb } from "../src/db/client";

const rawUrl = databaseUrl() ?? "";
if (!rawUrl) {
	console.error("serve: no DATABASE_URL — set it in .env or the shell.");
	process.exit(1);
}

const target = resolveDatabaseTarget(rawUrl, databaseType());

// D1 / Turso are Worker-side bindings, not locally openable via bun:sqlite.
if (target.kind === "d1" || target.kind === "turso") {
	console.error(
		`serve: cannot open a ${target.kind} target (${target.url}) locally.\n` +
			`  - D1 is reached through the Worker's env.DB binding — deploy it:\n` +
			`      bun run src/main.ts cf-build && wrangler dev\n` +
			`  - Turso is reached through libSQL (TURSO_URL / TURSO_AUTH_TOKEN).`,
	);
	process.exit(1);
}

// Resolved auth instance (assigned below once Better Auth mounts). Declared up
// here so `buildQueryApp` can reference it without hitting the TDZ — the
// guarded query routes read it lazily at request time.
let authInstance: unknown = null;

// Build the request-path Drizzle db. `createQueryDb` seeds the schema on the
// same libSQL client (via an `unsafe` adapter), so queries see the tables.
const queryApp = buildQueryApp(await createQueryDb(target), authInstance);

// The combined server: /api → JSON queries; / → Honox UI (per mode).
// Typed with the augmented `Env` so `c.env` carries the sql/DB/auth bindings
// the app's routes rely on (honox's createApp also produces Hono<Env>).
const app = new Hono<Env>();

// Better Auth is OPTIONAL. `betterAuthEnabled()` is a Bun macro that inlines
// to a literal, so setting `BETTER_AUTH_ENABLED=false` collapses this `if` to
// dead code and the bundler drops the `mountBetterAuth` import (and the whole
// better-auth / drizzle-adapter bundle) from this script.
import { mountBetterAuth } from "../src/auth/mount";
let mountAuth: ((app: Hono<Env>) => void) | null = null;
// The resolved auth instance, exposed on the request context so the JSON
// query app's guarded routes (e.g. `POST /threads`) can read sessions via
// `getSession` — mirrors `app/server.ts`'s `c.env.auth` middleware.
if (betterAuthEnabled()) {
	// Auth tables: idempotent — covers existing DBs that predate Better Auth.
	// The auth instance is wired to the same SQLite database via the drizzle
	// adapter (the auth tables are in drizzle/*_auth_sqlite_create.sql).
	// Better Auth still seeds via `sql.unsafe` on a Bun `SQL` client (legacy
	// path); off by default, so this block is dead code in the build.
	const authSql = new SQL(target.url);
	const localAuth = await mountBetterAuth(authSql);
	mountAuth = (app) => localAuth.mount(app);
	authInstance = localAuth.instance;
}
if (mountAuth) mountAuth(app);

// The JSON query app (`buildQueryApp`) carries its own middleware that exposes
// the SQL client + Better Auth instance on its request context (so guarded
// routes like `POST /threads` resolve sessions via `getSession`). The UI app
// (dist) does the same internally. No parent-level middleware is needed.

// --- CLI args: [port] [mode]  OR  --port=  --mode=  /  --port / --mode
const rawArgs = process.argv.slice(2);
const argModeEq = rawArgs.find((a) => a.startsWith("--mode="))?.split("=")[1];
const argPortEq = rawArgs.find((a) => a.startsWith("--port="))?.split("=")[1];
const argModeNext = rawArgs.includes("--mode") ? rawArgs[rawArgs.indexOf("--mode") + 1] : undefined;
const argPortNext = rawArgs.includes("--port") ? rawArgs[rawArgs.indexOf("--port") + 1] : undefined;
const positional = rawArgs.filter((a) => !a.startsWith("--"));
const mode = (argModeEq ?? argModeNext ?? positional[1] ?? "ui+api").toLowerCase();

// Port resolution precedence: PORT env var → --port/positional arg → 8787.
const port =
	Number(process.env.PORT) ||
	Number(argPortEq) ||
	Number(argPortNext) ||
	Number(positional[0]) ||
	8787;

// --- Try to load the built Honox UI (dist/index.js). It's a self-contained
// Hono app (SSR + /static/* + favicon) produced by `bun run src/main.ts ui:build`.
const UI_BUNDLE = resolve(import.meta.dir, "../dist/index.js");
const hasUi = existsSync(UI_BUNDLE);

if (mode === "api") {
	// API only: /api AND / (back-compat for clients hitting the root).
	app.route("/api", queryApp);
	app.route("/", queryApp);
	console.log("serve: mode=api — JSON API at /api AND / (no UI).");
} else if (mode === "ui") {
	// UI only.
	if (!hasUi) {
		console.error(
			"serve: mode=ui but no dist/index.js — build the UI first:\n" +
				"  bun run src/main.ts ui:build",
		);
		process.exit(1);
	}
	const { default: uiApp } = await import(UI_BUNDLE);
	app.route("/", uiApp as Hono);
	console.log("serve: mode=ui — Honox UI at / (from dist/index.js).");
} else if (mode === "ui+api" || mode === "both") {
	// Explicit UI + API.
	if (!hasUi) {
		console.error(
			"serve: mode=ui+api but no dist/index.js — build the UI first:\n" +
				"  bun run src/main.ts ui:build",
		);
		process.exit(1);
	}
	const { default: uiApp } = await import(UI_BUNDLE);
	app.route("/api", queryApp);
	app.route("/", uiApp as Hono);
	console.log("serve: mode=ui+api — Honox UI at / + JSON API at /api (dist/index.js).");
} else {
	// auto (default): UI at / when built, else API at both / and /api.
	if (hasUi) {
		const { default: uiApp } = await import(UI_BUNDLE);
		app.route("/api", queryApp);
		app.route("/", uiApp as Hono);
		console.log("serve: mode=auto — Honox UI at / + JSON API at /api (dist/index.js).");
	} else {
		app.route("/api", queryApp);
		app.route("/", queryApp);
		console.log(
			"serve: mode=auto, no dist/index.js — JSON API at /api AND /.\n" +
				"  Build the UI with: bun run src/main.ts ui:build",
		);
	}
}

const server = Bun.serve({
	port,
	fetch: app.fetch,
});

const serveApi = mode === "api" || mode === "auto" || mode === "ui+api" || mode === "both";
console.log(`BBS query server running on http://localhost:${server.port}  (mode=${mode})`);
if (mode !== "api") {
	console.log(`  UI : http://localhost:${server.port}/  (Honox UI)`);
}
if (serveApi) {
	console.log("  API: /api/stats, /api/boards, /api/boards/:id/threads, /api/threads/:id/replies, /api/users/:id/posts, /api/search?q=, /api/latest-posts");
}
