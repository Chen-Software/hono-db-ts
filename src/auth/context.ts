/**
 * auth/context — get the Better Auth session inside a Hono route.
 *
 * SSR routes (honox `createRoute`) read the current user by forwarding the
 * request's cookies to Better Auth:
 *
 *   import { getSession } from "@/auth/context";
 *
 *   export default createRoute(async (c) => {
 *     const session = await getSession(c);
 *     if (!session?.user) return c.redirect("/sign-in");
 *     ...
 *   });
 *
 * How the auth database reaches the route:
 *
 *   The server entry exposes it on the context under a shared key. Two
 *   deployments, two shapes — but `context.ts` only consumes ONE of them and
 *   never imports a bun-only driver:
 *
 *   - Cloudflare Workers (`app/server.cf.ts`, `worker/d1.ts`): `c.env.DB` is
 *     the D1 binding → wrapped with `drizzle-orm/d1` (Workers-safe).
 *   - Local (`app/server.ts`): the entry attaches a *ready* Better Auth
 *     instance to `c.env.auth` (built at startup from the bun:sqlite client),
 *     so no `drizzle-orm/bun-sql` import is needed here at all.
 *
 * This keeps the module Worker-bundlable: `drizzle-orm/d1` is Workers-clean,
 * and there is NO reference to bun:sql anywhere in this file.
 */
import type { Context } from "hono";
import { authEnvFromBindings, authEnvFromProcessEnv } from "./hono";
import { createAuth } from "./index";

/** Build a Workers-side auth instance from the D1 binding. */
async function authFromD1(c: Context) {
	const db = d1Binding(c);
	if (!db) return null;
	const { drizzle } = await import("drizzle-orm/d1");
	const env = c.env as {
		BETTER_AUTH_URL?: string;
		BETTER_AUTH_SECRET?: string;
	};
	return createAuth(
		drizzle(db as never),
		env.BETTER_AUTH_SECRET !== undefined
			? authEnvFromBindings(env)
			: authEnvFromProcessEnv(),
	);
}

/** The D1 binding, if this is a Workers request. */
export function d1Binding(c: Context): unknown {
	return (c.env as { DB?: unknown }).DB;
}

/** A pre-built auth instance (local entry attaches this to c.env.auth). */
export function instanceFromContext(c: Context) {
	return (c.env as { auth?: ReturnType<typeof createAuth> }).auth;
}

/** Resolve the current session (null when unauthenticated). */
export async function getSession(c: Context) {
	// Prefer a pre-built instance (local entry) — zero overhead, no driver import.
	const inst = instanceFromContext(c) ?? (await authFromD1(c));
	if (!inst) return null;
	return inst.api.getSession({ headers: c.req.raw.headers });
}
