/**
 * `createRepo()` — builds a generic repository for the active dialect using the
 * unified `src/db/client.ts` `createClient()`.
 *
 * This module is **local-only**: it imports `createClient()` (Bun macros +
 * `bun:sqlite`) which Wrangler/esbuild cannot bundle, so the Cloudflare Worker
 * must NOT import it. The Worker builds its repos from bindings directly via
 * `createRepos()` in `repos.ts` (see `src/worker/<dialect>.ts`).
 */

import {
	createRepos,
	type PgRepoDb,
	type Repos,
	type SqliteRepoDb,
} from "./repos";
import { createClient } from "../db/client";
import { isPg } from "../macros/db" with { type: "macro" };
import * as pgSchema from "../db/schema/postgres";
import * as sqliteSchema from "../db/schema/sqlite";

/**
 * Build the generic repos for the active dialect from `.env` / `NODE_ENV`,
 * choosing the client via `createClient()` (local dev vs remote) and the
 * matching schema. `createRepos` picks the repo family via the `isPg()` macro.
 */
export async function createRepo(): Promise<Repos> {
	const { db } = await createClient();
	const schema = isPg() ? pgSchema.schema : sqliteSchema.schema;
	return createRepos(db as unknown as SqliteRepoDb | PgRepoDb, schema);
}
