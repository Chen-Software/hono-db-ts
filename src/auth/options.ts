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

/**
 * Better Auth options (env-independent).
 * Docs: https://www.better-auth.com/docs/reference/options
 */
export const betterAuthOptions: BetterAuthOptions = {
	appName: "BBS Forum",
	/** Base path for the auth endpoints — the UI and clients call `/api/auth/...`. */
	basePath: "/api/auth",
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
	 * accounts, …). The forum's domain schema types all id columns as
	 * `crypto.UUID` (and validates them as such), so the authenticated user's
	 * id — which the guarded `POST /threads` stamps onto `authorId` — must be a
	 * UUID too. Without this, sign-ups would produce nanoid-style ids that fail
	 * the `threads.authorId` UUID assertion.
	 */
	advanced: {
		// Emit UUID v4 ids for every Better Auth entity (users, sessions,
		// accounts, …) so the authenticated user's id — which the guarded
		// `POST /threads` stamps onto `authorId` — matches the forum schema's
		// `crypto.UUID` type. Without this, sign-ups produce nanoid-style ids
		// that fail the `threads.authorId` UUID assertion.
		database: { generateId: "uuid" },
	},
};
