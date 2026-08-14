/**
 * auth/mount — mount Better Auth on a Hono app, gated for dead-code
 * elimination.
 *
 * The `mountBetterAuth` factory is only ever referenced inside an
 * `if (betterAuthEnabled())` block (see `app/server.ts`, `scripts/serve.ts`,
 * `src/worker/*`). Because `betterAuthEnabled()` is a Bun macro that inlines to
 * a literal, `BETTER_AUTH_ENABLED=false` builds collapse that `if` to dead code
 * and the bundler drops this module — and its `better-auth` /
 * `drizzle-adapter` / `node:fs` (bun-only) imports — from the output entirely.
 *
 * The module is imported at MODULE SCOPE by its callers (not via dynamic
 * `import()`), so tree-shaking can remove it; it is only *called* when auth is
 * enabled.
 */

import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";

import { createAuth } from "./index";
import { authEnvFromBindings, authEnvFromProcessEnv } from "./hono";
import { ensureAuthSchema } from "./migrate";
import type { SqlQueryExecutor } from "@/capacities/servable";

/**
 * Build a Better Auth instance + mount function for a local (bun:sqlite) app.
 *
 * Runs the (idempotent) auth schema bootstrap once, builds the auth instance
 * from `process.env`, and returns a sync `(app) => void` that wires `/api/auth/*`
 * → the auth handler. Call `await mountBetterAuth(sql)` once at startup, then
 * call the returned function inside honox's synchronous `init` callback.
 */
export async function mountBetterAuth(
	client: SqlQueryExecutor | SQL,
): Promise<(app: import("hono").Hono<any>) => void> {
	await ensureAuthSchema(client as SqlQueryExecutor);
	const auth = createAuth(
		drizzle.sqlite({ client: client as SQL }),
		authEnvFromProcessEnv(),
	);
	return (app) => {
		app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
	};
}

/** Mount Better Auth on a Hono app from Worker bindings + an already-wired drizzle db. */
export function mountBetterAuthFromBindings(
	app: import("hono").Hono<any>,
	env: { BETTER_AUTH_URL?: string; BETTER_AUTH_SECRET?: string },
	db: import("./index").AuthDatabase,
): void {
	const auth = createAuth(db, authEnvFromBindings(env));
	app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
}
