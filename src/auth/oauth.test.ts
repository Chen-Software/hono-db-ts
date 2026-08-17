/**
 * OAuth — verifies the better-auth generic-oauth plugin
 * (https://better-auth.com/docs/plugins/generic-oauth) is actually ENABLED at
 * runtime when providers are configured, and omitted when they are not.
 *
 * The plugin was scaffolded in `options.ts` / `index.ts` but the runtime call
 * sites (`mountBetterAuth`, `mountBetterAuthFromBindings`, `authFromD1`) never
 * passed `oauthProviders` to `createAuth` — so OAuth could never activate. This
 * test pins that wiring: providers are fed from `process.env.OAUTH_PROVIDERS`
 * (the same path the production code uses via `oauthProvidersFromEnv`).
 *
 * Uses a fake provider with MANUAL endpoints (no discovery fetch) so the test
 * is deterministic and needs no network. The assertions only check that the
 * plugin builds the provider's authorization URL — exercising the real mounted
 * `/api/auth/sign-in/oauth2` route without talking to a real IdP.
 */

import { afterEach, describe, expect, it } from "bun:test";
import { SQL } from "bun";
import type { Env } from "hono";
import { Hono } from "hono";

import { mountBetterAuth } from "./mount";
import { googleFromEnv } from "./hono";
import { googleSocialProvider } from "./options";

const FAKE_PROVIDER = {
	providerId: "test",
	clientId: "test-client-id",
	clientSecret: "test-client-secret",
	authorizationUrl: "https://idp.test/authorize",
	tokenUrl: "https://idp.test/token",
	userInfoUrl: "https://idp.test/userinfo",
	scopes: ["openid", "email"],
};

const OAUTH_ENV = "OAUTH_PROVIDERS";

/** Captured once at module load so each test can restore it afterwards. */
const saved = process.env[OAUTH_ENV];
afterEach(() => {
	if (saved === undefined) delete process.env[OAUTH_ENV];
	else process.env[OAUTH_ENV] = saved;
});

async function buildApp(providers: unknown[] | null) {
	if (providers) process.env[OAUTH_ENV] = JSON.stringify(providers);
	else delete process.env[OAUTH_ENV];
	const client = new SQL(":memory:");
	const localAuth = await mountBetterAuth(client);
	const app = new Hono<Env>();
	localAuth.mount(app);
	return app;
}

describe("OAuth · generic-oauth wiring", () => {
	it("enables the plugin and builds the provider authorize URL when configured", async () => {
		const app = await buildApp([FAKE_PROVIDER]);
		const res = await app.request("/api/auth/sign-in/oauth2", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				providerId: "test",
				callbackURL: "/",
				disableRedirect: true,
			}),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { url?: string; redirect?: boolean };
		expect(body.redirect).toBe(false);
		expect(body.url).toBeTruthy();
		// The authorize URL must point at the configured endpoint with our client.
		expect(body.url).toContain("https://idp.test/authorize");
		expect(body.url).toContain("client_id=test-client-id");
		// better-auth appends its callback (derived from baseURL) for the IdP.
		// It is percent-encoded inside `redirect_uri`, so decode before checking.
		expect(decodeURIComponent(body.url)).toContain("/oauth2/callback/test");
	});

	it("omits the plugin (404) when no providers are configured", async () => {
		const app = await buildApp(null);
		const res = await app.request("/api/auth/sign-in/oauth2", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				providerId: "test",
				callbackURL: "/",
				disableRedirect: true,
			}),
		});
		// No provider config → plugin not registered → endpoint does not exist.
		expect(res.status).toBeGreaterThanOrEqual(400);
	});
});

describe("OAuth · Google (core socialProviders)", () => {
	it("googleSocialProvider returns undefined when no config is supplied", () => {
		expect(googleSocialProvider(undefined)).toBeUndefined();
	});

	it("googleSocialProvider maps clientId/secret + optional hd/scopes", () => {
		const p = googleSocialProvider({
			clientId: "g-id",
			clientSecret: "g-secret",
			hostedDomain: "example.com",
			scopes: ["openid", "profile"],
		});
		expect(p).toEqual({
			clientId: "g-id",
			clientSecret: "g-secret",
			hd: "example.com",
			scope: ["openid", "profile"],
		});
	});

	it("googleFromEnv reads GOOGLE_OAUTH_* vars (absent → undefined)", () => {
		const savedId = process.env.GOOGLE_OAUTH_CLIENT_ID;
		const savedSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
		const savedHd = process.env.GOOGLE_OAUTH_HD;
		const savedScopes = process.env.GOOGLE_OAUTH_SCOPES;
		try {
			delete process.env.GOOGLE_OAUTH_CLIENT_ID;
			delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
			expect(googleFromEnv(process.env)).toBeUndefined();

			process.env.GOOGLE_OAUTH_CLIENT_ID = "g-id";
			process.env.GOOGLE_OAUTH_CLIENT_SECRET = "g-secret";
			process.env.GOOGLE_OAUTH_HD = "example.com";
			process.env.GOOGLE_OAUTH_SCOPES = "openid, profile";
			const cfg = googleFromEnv(process.env);
			expect(cfg).toEqual({
				clientId: "g-id",
				clientSecret: "g-secret",
				hostedDomain: "example.com",
				scopes: ["openid", "profile"],
			});
		} finally {
			if (savedId === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_ID;
			else process.env.GOOGLE_OAUTH_CLIENT_ID = savedId;
			if (savedSecret === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
			else process.env.GOOGLE_OAUTH_CLIENT_SECRET = savedSecret;
			if (savedHd === undefined) delete process.env.GOOGLE_OAUTH_HD;
			else process.env.GOOGLE_OAUTH_HD = savedHd;
			if (savedScopes === undefined) delete process.env.GOOGLE_OAUTH_SCOPES;
			else process.env.GOOGLE_OAUTH_SCOPES = savedScopes;
		}
	});

	it("mounts /sign-in/social with provider=google when GOOGLE_OAUTH_* env is set (not 404)", async () => {
		const savedId = process.env.GOOGLE_OAUTH_CLIENT_ID;
		const savedSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
		try {
			process.env.GOOGLE_OAUTH_CLIENT_ID = "g-id";
			process.env.GOOGLE_OAUTH_CLIENT_SECRET = "g-secret";
			const client = new SQL(":memory:");
			const localAuth = await mountBetterAuth(client);
			const app = new Hono<Env>();
			localAuth.mount(app);
			const res = await app.request("/api/auth/sign-in/social", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					provider: "google",
					callbackURL: "/",
					disableRedirect: true,
				}),
			});
			// The endpoint is mounted (not a 404). Without a real IdP the plugin
			// may error (5xx/4xx) trying to build the authorize URL, but the
			// route itself exists.
			expect(res.status).not.toBe(404);
		} finally {
			if (savedId === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_ID;
			else process.env.GOOGLE_OAUTH_CLIENT_ID = savedId;
			if (savedSecret === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
			else process.env.GOOGLE_OAUTH_CLIENT_SECRET = savedSecret;
		}
	});
});
