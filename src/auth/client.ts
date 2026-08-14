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
 *   import { authClient } from "@/auth/client";
 *   const { data } = await authClient.signIn.email({ email, password });
 *   const session = await authClient.getSession();
 *
 * For React islands, `better-auth/react` also exports `useSession` etc.:
 *
 *   import { useSession } from "better-auth/react";
 *
 * Docs: https://www.better-auth.com/docs/integrations/react
 */
import { createAuthClient } from "better-auth/client";

import { betterAuthUrl } from "@/macros/envs" with { type: "macro" };

// `location` exists in the browser/Worker global but not in Bun/Node typings,
// so read it through a typed cast rather than `globalThis.location`. In a
// non-browser build the base URL comes from the `betterAuthUrl()` macro.
const loc = (globalThis as unknown as { location?: { origin: string } })
	.location;
const baseURL = loc ? loc.origin : (betterAuthUrl() ?? "http://localhost:8787");

/** The shared, typed Better Auth client. */
export const authClient = createAuthClient({ baseURL });

/** Convenience re-exports for islands (avoid reaching into `authClient`). */
export const { signIn, signUp, signOut, getSession } = authClient;
