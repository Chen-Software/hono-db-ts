/**
 * better-auth.config — CLI configuration for `@better-auth/cli generate`.
 *
 * Mirrors step 6 of the Hono reference example: the CLI reads this config,
 * instantiates Better Auth with the SAME options + schema as the runtime
 * (`src/auth/`), and emits the canonical table schema:
 *
 *     bunx @better-auth/cli generate \
 *       --config ./better-auth.config.ts \
 *       --output ./src/auth/schema.ts
 *
 * The starter ships the schema pre-written in `src/auth/schema.ts` (and the
 * matching DDL in `drizzle/*_auth_sqlite_create.sql`), so generation is only
 * needed when you add Better Auth plugins (OAuth, organization, …) and want
 * the CLI to extend the schema for you.
 *
 * This file is tooling-only: it is never imported by the app. It deliberately
 * uses `@libsql/client` + `drizzle-orm/libsql` (which run under **Node**) so
 * the CLI works without the Bun runtime — `drizzle-orm/bun-sql` would require
 * `bun`. The runtime factory in `src/auth/index.ts` uses the real D1 /
 * bun:sqlite drivers instead.
 */

import { createClient } from "@libsql/client";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/libsql";

import { authSchema } from "./src/auth/schema";
import { betterAuthOptions } from "./src/auth/options";

// An in-memory libSQL client is enough for `generate`: it only reads the
// adapter's field metadata to emit the schema — no live connection required.
const client = createClient({ url: process.env.DATABASE_URL ?? ":memory:" });
const db = drizzle({ client });

export const auth = betterAuth({
	...betterAuthOptions,
	baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:8787",
	secret: process.env.BETTER_AUTH_SECRET ?? "cli-only-secret-not-used-at-runtime",
	database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema }),
});

