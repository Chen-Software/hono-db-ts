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

import type { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import type { SqlQueryExecutor } from "@/capacities/servable";
import { authEnvFromBindings, authEnvFromProcessEnv } from "./hono";
import { createAuth } from "./index";
import { ensureAuthSchema } from "./migrate";

/**
 * The result of building local Better Auth: a function that mounts `/api/auth/*`
 * on a Hono app, plus the shared instance (so routes can read sessions without
 * re-importing a bun-only driver).
 */
export interface LocalAuth {
	/** Wire `GET|POST /api/auth/*` → the auth handler on `app`. */
	mount: <E extends import("hono").Env = import("hono").Env>(
		app: import("hono").Hono<E>,
	) => void;
	/** The auth instance, for SSR routes to call `getSession` on. */
	instance: ReturnType<typeof createAuth>;
}

/**
 * Build a Better Auth instance + mount function for a local (bun:sqlite) app.
 *
 * Runs the (idempotent) auth schema bootstrap once, builds the auth instance
 * from `process.env`, and returns `{ mount, instance }`: `mount` wires
 * `/api/auth/*` → the handler (call it inside honox's sync `init` callback),
 * and `instance` lets routes resolve sessions directly.
 */
export async function mountBetterAuth(
	client: SqlQueryExecutor | SQL,
): Promise<LocalAuth> {
	await ensureAuthSchema(client as SqlQueryExecutor);
	const auth = createAuth(
		drizzle.sqlite({ client: client as SQL }),
		authEnvFromProcessEnv(),
	);
	return {
		mount: (app) => {
			app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
		},
		instance: auth,
	};
}

/** Mount Better Auth on a Hono app from Worker bindings + an already-wired drizzle db. */
export function mountBetterAuthFromBindings<E extends import("hono").Env>(
	app: import("hono").Hono<E>,
	env: { BETTER_AUTH_URL?: string; BETTER_AUTH_SECRET?: string },
	db: import("./index").AuthDatabase,
): void {
	const auth = createAuth(db, authEnvFromBindings(env));
	app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
}
