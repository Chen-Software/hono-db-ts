/**
 * auth/index — Better Auth instance factory (Hono-on-Cloudflare style).
 *
 * Mirrors the Hono reference example (`src/lib/better-auth/index.ts`): a
 * factory that takes the runtime environment and returns a configured
 * `betterAuth` instance wired to a drizzle database through the drizzle
 * adapter.
 *
 * Unlike the reference (Neon Postgres), this starter is SQLite-everywhere:
 * the database is one of
 *
 *   - Bun's `SQL` (local `serve`) — wrapped with `drizzle-orm/bun-sql`,
 *   - Cloudflare D1 (`env.DB`) — wrapped with `drizzle-orm/d1`,
 *   - in-memory bun:sqlite (the CF sqlite worker backend).
 *
 * The auth DB lives in the SAME database file/binding as the domain data (see
 * `src/auth/schema.ts` + `drizzle/*_auth_sqlite_create.sql`), so no separate
 * datastore is needed.
 *
 * Because the worker binding (`env.DB`) is only available per-request, the
 * caller passes a *factory* (`makeDb`) rather than a db — `createAuth` is
 * called once per request on Workers, once at startup locally.
 */

import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuthOptions } from "./options";
import { authSchema } from "./schema";

/** Runtime pieces Better Auth needs that differ per deployment. */
export interface AuthEnv {
	/** Public base URL of the auth endpoints (e.g. `https://codeforge.example.workers.dev`). */
	baseURL: string;
	/** Signing secret (>= 32 chars). Use a Cloudflare secret binding in prod. */
	secret: string;
}

/** A drizzle instance compatible with `better-auth/adapters/drizzle` (sqlite). */
export type AuthDatabase = Parameters<typeof drizzleAdapter>[0];

/**
 * Build a Better Auth instance for the given environment + database.
 *
 * `db` is already a drizzle instance (see the module docstring for how each
 * runtime wraps its SQL client). `options` may extend the shared options
 * (e.g. plugins).
 */
export function createAuth(
	db: AuthDatabase,
	env: AuthEnv,
	options: BetterAuthOptions = {},
) {
	return betterAuth({
		...betterAuthOptions,
		...options,
		baseURL: env.baseURL,
		secret: env.secret,
		database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema }),
	});
}

export type { BetterAuthOptions };
export { authSchema, betterAuthOptions };
