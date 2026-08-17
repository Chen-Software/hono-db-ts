/**
 * auth/options — shared Better Auth options.
 *
 * Split from the instance factory so the SAME options can be reused by the
 * CLI schema-generation config (`better-auth.config.ts`) and the runtime
 * instance (`src/auth/index.ts`), exactly like the Hono reference example
 * (`src/lib/better-auth/options.ts`).
 *
 * Environment-dependent values (baseURL, secret, database) are injected by
 * the factory at the call site — options.ts stays pure and env-free.
 */

import type { BetterAuthOptions } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import { genericOAuth, type GenericOAuthOptions } from "better-auth/plugins";

/**
 * A single Generic OAuth provider, configured from environment at the call
 * site (so `options.ts` stays pure / env-free). Fields map 1:1 onto
 * `GenericOAuthConfig` (see `better-auth/plugins/generic-oauth`):
 * https://better-auth.com/docs/plugins/generic-oauth
 */
export interface OAuthProviderConfig {
	/** Unique id that clients pass as `providerId` to `/sign-in/oauth2`. */
	providerId: string;
	clientId: string;
	clientSecret: string;
	/**
	 * EITHER a `discoveryUrl` (the plugin fetches authz/token/userinfo from the
	 * provider's `/.well-known/openid-configuration`) OR the three explicit
	 * endpoints below. Discovery is recommended for GitHub/GitLab/Google; the
	 * manual endpoints let you wire any provider (or a mock in tests) with no
	 * network fetch.
	 */
	discoveryUrl?: string;
	authorizationUrl?: string;
	tokenUrl?: string;
	userInfoUrl?: string;
	/** Extra headers sent to the authorization / token endpoints. */
	authorizationHeaders?: Record<string, string>;
	tokenHeaders?: Record<string, string>;
	/** Client authentication method for the token endpoint. */
	authentication?: "basic" | "post" | "client_secret";
	/** Expected issuer, validated on callback (RFC 9207). */
	issuer?: string;
	/** Require the `iss` param on callback (recommended for modern IdPs). */
	requireIssuerValidation?: boolean;
	/** Scopes to request (defaults to `openid profile email`). */
	scopes?: string[];
	/** Public callback URL override (defaults to the plugin's derived one). */
	redirectURI?: string;
	/** Use PKCE (recommended for public clients). Defaults to true. */
	pkce?: boolean;
	responseType?: string;
	responseMode?: string;
	prompt?: string;
	accessType?: string;
	authorizationUrlParams?: Record<string, string>;
}

/**
 * Build the Generic OAuth plugin from a list of provider configs, or `null`
 * when none are configured. The plugin is only enabled when at least one
 * provider exists — so deployments without OAuth env vars add zero overhead.
 */
export function oauthPluginFromProviders(
	providers: OAuthProviderConfig[] | undefined,
): ReturnType<typeof genericOAuth> | null {
	if (!providers?.length) return null;
	const config = providers.map((p) => ({
		providerId: p.providerId,
		clientId: p.clientId,
		clientSecret: p.clientSecret,
		...(p.discoveryUrl ? { discoveryUrl: p.discoveryUrl } : {}),
		...(p.authorizationUrl ? { authorizationUrl: p.authorizationUrl } : {}),
		...(p.tokenUrl ? { tokenUrl: p.tokenUrl } : {}),
		...(p.userInfoUrl ? { userInfoUrl: p.userInfoUrl } : {}),
		...(p.authorizationHeaders ? { authorizationHeaders: p.authorizationHeaders } : {}),
		...(p.tokenHeaders ? { tokenHeaders: p.tokenHeaders } : {}),
		...(p.authentication ? { authentication: p.authentication } : {}),
		...(p.issuer ? { issuer: p.issuer } : {}),
		...(p.requireIssuerValidation !== undefined
			? { requireIssuerValidation: p.requireIssuerValidation }
			: {}),
		...(p.scopes?.length ? { scopes: p.scopes } : {}),
		...(p.redirectURI ? { redirectURI: p.redirectURI } : {}),
		...(p.pkce !== undefined ? { pkce: p.pkce } : {}),
		...(p.responseType ? { responseType: p.responseType } : {}),
		...(p.responseMode ? { responseMode: p.responseMode } : {}),
		...(p.prompt ? { prompt: p.prompt } : {}),
		...(p.accessType ? { accessType: p.accessType } : {}),
		...(p.authorizationUrlParams ? { authorizationUrlParams: p.authorizationUrlParams } : {}),
	}));
	return genericOAuth({ config });
}

/**
 * Google OAuth provider config — built into better-auth core (no plugin
 * needed), enabled via `socialProviders.google`:
 * https://www.better-auth.com/docs/authentication/social#google
 */
export interface GoogleOAuthConfig {
	clientId: string;
	clientSecret: string;
	/** Request a refresh token (`access_type=offline`). */
	accessType?: "offline" | "online";
	/** Restrict sign-in to a Google Workspace domain (`hd`). */
	hostedDomain?: string;
	/** Extra OAuth scopes beyond the default `openid email profile`. */
	scopes?: string[];
	/** Custom public redirect URI (defaults to the derived callback). */
	redirectURI?: string;
}

/**
 * Build the `socialProviders.google` value, or `undefined` when no Google
 * config is supplied — a deployment without `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
 * simply gets no Google button (zero overhead).
 */
export function googleSocialProvider(
	config: GoogleOAuthConfig | undefined,
):
	| {
			clientId: string;
			clientSecret: string;
			accessType?: "offline" | "online";
			hd?: string;
			scope?: string[];
			redirectURI?: string;
	  }
	| undefined {
	if (!config) return undefined;
	return {
		clientId: config.clientId,
		clientSecret: config.clientSecret,
		...(config.accessType ? { accessType: config.accessType } : {}),
		...(config.hostedDomain ? { hd: config.hostedDomain } : {}),
		...(config.scopes?.length ? { scope: config.scopes } : {}),
		...(config.redirectURI ? { redirectURI: config.redirectURI } : {}),
	};
}

/**
 * Better Auth options (env-independent).
 * Docs: https://www.better-auth.com/docs/reference/options
 */
export const betterAuthOptions: BetterAuthOptions = {
	appName: "CodeForge",
	/** Base path for the auth endpoints — the UI and clients call `/api/auth/...`. */
	basePath: "/api/auth",
	/**
	 * 2FA (TOTP + backup codes). Enabling the plugin means a user with
	 * `twoFactorEnabled` set can NEVER complete a password sign-in through the
	 * plugin — the git transport depends on this to reject password auth for
	 * 2FA-enrolled users (`src/git/auth.ts`). PAT auth is unaffected.
	 * Docs: https://better-auth.com/docs/plugins/2fa
	 *
	 * Generic OAuth is added dynamically by `createAuth` from env-provided
	 * provider config (see `oauthPluginFromProviders`), so it is NOT listed
	 * here — keeping `options.ts` env-free and the CLI schema stable.
	 */
	plugins: [twoFactor()],
	/** Email + password auth (sign-up / sign-in / sign-out / get-session). */
	emailAndPassword: {
		enabled: true,
		/**
		 * Seed a demo account on first sign-in when the email/password is used —
		 * disabled here; the starter seeds users via `db:seed` instead.
		 */
		autoSignIn: true,
	},
	/**
	 * Generate UUID v4 ids for every Better Auth entity (users, sessions,
	 * accounts, …). The forge's domain schema types all id columns as
	 * `crypto.UUID` (and validates them as such), so the authenticated user's
	 * id — which the guarded `POST /repositories` stamps onto `ownerId` — must
	 * be a UUID too. Without this, sign-ups would produce nanoid-style ids that
	 * fail the `repositories.ownerId` UUID assertion.
	 */
	advanced: {
		// Emit UUID v4 ids for every Better Auth entity (users, sessions,
		// accounts, …) so the authenticated user's id — which the guarded
		// `POST /repositories` stamps onto `ownerId` — matches the forge
		// schema's `crypto.UUID` type. Without this, sign-ups produce
		// nanoid-style ids that fail the `repositories.ownerId` UUID assertion.
		database: { generateId: "uuid" },
	},
};
