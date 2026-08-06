/**
 * Build the storage-agnostic repository for the active dialect.
 *
 * The client comes from the unified `src/db/client.ts` `createClient()`, which
 * auto-selects the local dev vs remote client based on `NODE_ENV`. The matching
 * repo implementation is then picked by dialect. Each repo module stays
 * separate so the Worker build (via `src/worker/<dialect>.ts`) keeps its
 * single-backend tree-shaking.
 *
 * Used by the local Bun entry (`main.ts`). The Worker entry
 * (`src/worker/<dialect>.ts`) constructs its repo from Worker bindings instead.
 */

import type { MoviesRepo } from "./movies-repo";
import { createClient } from "../db/client";
import { createSqliteClient, type SqliteDb } from "../db/sqlite-client";
import { createTursoMoviesRepo } from "./movies-repo-turso";
import { createPostgresMoviesRepo } from "./movies-repo-postgres";
import { createSqliteMoviesRepo } from "./movies-repo-sqlite";
import { dbDialect } from "../macros/db-dialect" with { type: "macro" };

/**
 * Build the repo for the active dialect using `createClient()` (local dev vs
 * remote is chosen automatically from the environment).
 */
export async function createRepo(): Promise<MoviesRepo> {
	const dialect = dbDialect();

	switch (dialect) {
		case "turso":
		case "tursodb":
		case "turso-cloud": {
			const { db } = await createClient();
			return createTursoMoviesRepo(db as Parameters<typeof createTursoMoviesRepo>[0]);
		}
		case "neon":
		case "postgres":
		case "postgresql":
		case "pg": {
			const { db } = await createClient();
			return createPostgresMoviesRepo(
				db as Parameters<typeof createPostgresMoviesRepo>[0],
			);
		}
		case "sqlite":
		case "d1":
		default: {
			// d1 maps to the local SQLite client for local runs; D1 itself is a
			// Worker binding handled by `src/worker/d1.ts`.
			const db =
				dialect === "d1"
					? createSqliteClient("sqlite.db")
					: ((await createClient()).db as SqliteDb);
			return createSqliteMoviesRepo(db);
		}
	}
}

export type { SqliteDb };
