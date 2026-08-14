/**
 * auth/hono — mount the Better Auth handler on a Hono app.
 *
 * Mirrors the Hono reference example:
 *
 *     app.on(['GET', 'POST'], '/api/auth/*', (c) => auth(c.env).handler(c.req.raw))
 *
 * A factory is used instead of a singleton because on Workers the DB binding
 * (`env.DB`) and secrets (`env.BETTER_AUTH_SECRET`) are only available
 * per-request; locally the factory can close over a startup-built instance.
 *
 * The mount path must match `betterAuthOptions.basePath` (`/api/auth`), and it
 * must be registered BEFORE the query app's `/api` route so Hono routes
 * `/api/auth/*` to the auth handler rather than the BBS query app.
 */

import type { Context, Hono } from "hono";

import { betterAuthSecret, betterAuthUrl } from "@/macros/envs" with { type: "macro" };
import { createAuth, type AuthEnv } from "./index";

/** Builds the (per-request or shared) Better Auth instance. */
export type AuthFactory = (c: Context) => ReturnType<typeof createAuth>;

/** Register `GET|POST /api/auth/*` → Better Auth's request handler. */
export function mountAuth(app: Hono, makeAuth: AuthFactory): void {
	app.on(["GET", "POST"], "/api/auth/*", (c) => makeAuth(c).handler(c.req.raw));
}

/**
 * Build `AuthEnv` from the build-time env via the `betterAuth*` macros.
 *
 * These are Bun macros: `betterAuthUrl()` / `betterAuthSecret()` inline the
 * values at build time. The whole module is only ever imported inside an
 * `if (betterAuthEnabled())` block, so a `BETTER_AUTH_ENABLED=false` build
 * drops it (and the better-auth bundle it feeds) entirely.
 */
export function authEnvFromProcessEnv(): AuthEnv {
	return {
		baseURL: betterAuthUrl() ?? "http://localhost:8787",
		secret: betterAuthSecret() ?? "",
	};
}

/** Build `AuthEnv` from Worker bindings. */
export function authEnvFromBindings(env: {
	BETTER_AUTH_URL?: string;
	BETTER_AUTH_SECRET?: string;
}): AuthEnv {
	return {
		baseURL: env.BETTER_AUTH_URL ?? "http://localhost:8787",
		secret: env.BETTER_AUTH_SECRET ?? "",
	};
}
