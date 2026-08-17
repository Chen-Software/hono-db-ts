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
 * `/api/auth/*` to the auth handler rather than the query app.
 */

import type { Context, Hono } from "hono";

import { betterAuthSecret, betterAuthUrl } from "@/macros/envs" with {
	type: "macro",
};
import type { GoogleOAuthConfig, OAuthProviderConfig } from "./options";
import type { AuthEnv, createAuth } from "./index";

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
export function authEnvFromBindings(env: Record<string, string | undefined>): AuthEnv {
	return {
		baseURL: env.BETTER_AUTH_URL ?? "http://localhost:8787",
		secret: env.BETTER_AUTH_SECRET ?? "",
	};
}

/**
 * Resolve configured Generic OAuth providers from the environment.
 *
 * The generic-oauth plugin (https://better-auth.com/docs/plugins/generic-oauth)
 * is only enabled when at least one provider is configured — `createAuth`
 * omits the plugin entirely otherwise. Two sources feed this (first wins):
 *
 *   1. `OAUTH_PROVIDERS` — a JSON array of `OAuthProviderConfig` (most
 *      flexible; supports any provider, including manual authz/token/userinfo
 *      endpoints with no discovery fetch).
 *   2. Well-known forge providers, enabled by their own env vars:
 *        - GitHub:  GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET
 *        - GitLab:  GITLAB_OAUTH_CLIENT_ID / GITLAB_OAUTH_CLIENT_SECRET
 *
 * Returns `[]` when nothing is configured → the plugin is omitted (zero
 * overhead). The redirect URI the IdP must be configured with is
 * `${baseURL}/api/auth/oauth2/callback/:providerId`.
 */
export function oauthProvidersFromEnv(
	env: Record<string, string | undefined>,
): OAuthProviderConfig[] {
	const json = env.OAUTH_PROVIDERS;
	if (json) {
		try {
			const parsed = JSON.parse(json);
			if (Array.isArray(parsed)) return parsed as OAuthProviderConfig[];
		} catch {
			// malformed JSON → fall through to well-known provider blocks
		}
	}
	const providers: OAuthProviderConfig[] = [];
	if (env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET) {
		providers.push({
			providerId: "github",
			clientId: env.GITHUB_OAUTH_CLIENT_ID,
			clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET,
			discoveryUrl: "https://github.com/.well-known/openid-configuration",
			scopes: ["openid", "read:user", "user:email"],
		});
	}
	if (env.GITLAB_OAUTH_CLIENT_ID && env.GITLAB_OAUTH_CLIENT_SECRET) {
		providers.push({
			providerId: "gitlab",
			clientId: env.GITLAB_OAUTH_CLIENT_ID,
			clientSecret: env.GITLAB_OAUTH_CLIENT_SECRET,
			discoveryUrl: "https://gitlab.com/.well-known/openid-configuration",
			scopes: ["openid", "read_user", "email"],
		});
	}
	return providers;
}

/**
 * Resolve the Google OAuth config from the environment, or `undefined` when
 * Google is not configured.
 *
 * Google is a CORE better-auth social provider (`socialProviders.google` —
 * https://www.better-auth.com/docs/authentication/social#google), so it is
 * wired separately from the generic-oauth plugin above. Env vars:
 *
 *   GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET  (required)
 *   GOOGLE_OAUTH_HD            (optional — restrict to a Workspace domain)
 *   GOOGLE_OAUTH_SCOPES        (optional — extra scopes, comma-separated)
 *
 * The redirect URI the Google Cloud console must be configured with is
 * `${baseURL}/api/auth/callback/google`.
 */
export function googleFromEnv(
	env: Record<string, string | undefined>,
): GoogleOAuthConfig | undefined {
	const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
	const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET;
	if (!clientId || !clientSecret) return undefined;
	return {
		clientId,
		clientSecret,
		...(env.GOOGLE_OAUTH_HD ? { hostedDomain: env.GOOGLE_OAUTH_HD } : {}),
		...(env.GOOGLE_OAUTH_SCOPES
			? { scopes: env.GOOGLE_OAUTH_SCOPES.split(",").map((s) => s.trim()).filter(Boolean) }
			: {}),
	};
}
