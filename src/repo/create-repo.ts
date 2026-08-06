/**
 * `createRepo()` — builds the storage-agnostic repository for the active
 * dialect using the unified `src/db/client.ts` `createClient()`.
 *
 * This module is **local-only**: it imports `createClient()` (Bun macros +
 * `bun:sqlite`) which Wrangler/esbuild cannot bundle, so the Cloudflare Worker
 * must NOT import it. The Worker builds its repo from bindings directly via
 * `createSqliteMoviesRepo` / `createPostgresMoviesRepo` in `movies-repo.ts`.
 */

import type { MoviesRepo } from "./movies-repo";
import {
	createPostgresMoviesRepo,
	createSqliteMoviesRepo,
} from "./movies-repo";
import { createClient } from "../db/client";
import { dbDialect } from "../macros/db-dialect" with { type: "macro" };

/**
 * Build the repo for the active dialect from `.env` / `NODE_ENV`, choosing the
 * client via `createClient()` (local dev vs remote) and the matching repo.
 */
export async function createRepo(): Promise<MoviesRepo> {
	const dialect = dbDialect();

	switch (dialect) {
		case "neon":
		case "postgres":
		case "postgresql":
		case "pg": {
			const { db } = await createClient();
			return createPostgresMoviesRepo(
				db as Parameters<typeof createPostgresMoviesRepo>[0],
			);
		}
		case "turso":
		case "tursodb":
		case "turso-cloud":
		case "sqlite":
		case "d1":
		default: {
			// sqlite / turso / d1 (local) all use the SQLite-family repo.
			const { db } = await createClient();
			return createSqliteMoviesRepo(
				db as Parameters<typeof createSqliteMoviesRepo>[0],
			);
		}
	}
}
