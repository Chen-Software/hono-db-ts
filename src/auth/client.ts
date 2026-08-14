/**
 * auth/client — typed Better Auth client for the browser / islands.
 *
 * The auth endpoints are served at `/api/auth/*` (see `betterAuthOptions
 * .basePath` and the `mountAuth` handler in `src/auth/hono.ts`). The client
 * points `baseURL` at the same origin the app is served from, so it just works
 * in the deployed worker, `wrangler dev`, and local `serve`.
 *
 * Use it from islands to sign up / sign in / sign out and read the session:
 *
 *   import { getAuthClient } from "@/auth/client";
 *   const { data } = await getAuthClient().signIn.email({ email, password });
 *
 * For React islands, `better-auth/react` also exports `useSession` etc.:
 *
 *   import { useSession } from "better-auth/react";
 *
 * Docs: https://www.better-auth.com/docs/integrations/react
 */
import { createAuthClient } from "better-auth/client";

import { betterAuthUrl } from "../macros/envs" with { type: "macro" };

// `location` exists in the browser/Worker global but not in Bun/Node typings,
// so read it through a typed cast rather than `globalThis.location`. In a
// non-browser build the base URL comes from the `betterAuthUrl()` macro.
const loc = (globalThis as unknown as { location?: { origin: string } })
	.location;
const baseURL = loc ? loc.origin : (betterAuthUrl() ?? "http://localhost:8787");

type AuthClient = ReturnType<typeof createAuthClient>;

let client: AuthClient | null = null;

/**
 * Lazily construct the shared Better Auth client.
 *
 * Deliberately NOT created at module top-level: a top-level `createAuthClient()`
 * call is a side effect that prevents bundlers (Rollup/esbuild) from
 * tree-shaking this module out when Better Auth is compiled away
 * (`BETTER_AUTH_ENABLED=false`, via the `__BETTER_AUTH_ENABLED__` Vite `define`
 * or the `betterAuthEnabled()` Bun macro). Laziness keeps the module
 * side-effect-free so the whole `better-auth` dependency drops from the bundle
 * on deployments that opt out of auth.
 */
export function getAuthClient(): AuthClient {
	if (!client) client = createAuthClient({ baseURL });
	return client;
}
