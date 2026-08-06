/**
 * Build the storage-agnostic repository for the active dialect.
 *
 * Reads `DATABASE_TYPE` at build time via the `src/macros/db.ts` macros, then
 * constructs the matching repository. Used by the local Bun entry (`main.ts`).
 * The Worker entry (`src/worker.ts`) selects D1 vs Neon from bindings instead.
 */

import { resolve } from "node:path";
import { dialect as macroDialect } from "../macros/db" with { type: "macro" };
import type { MoviesRepo } from "./movies-repo";
import { createSqliteMoviesRepo } from "./movies-repo-sqlite";
import { createTursoMoviesRepo } from "./movies-repo-turso";
import { createPostgresMoviesRepo } from "./movies-repo-postgres";
import { createTursoClient } from "../db/turso-client";
import { createPostgresClient } from "../db/postgres-client";

export function createRepo(): MoviesRepo {
	const d = macroDialect();

	switch (d) {
		case "postgres":
		case "neon": {
			const url =
				process.env["DATABASE_URL"] ??
				"postgres://postgres:postgres@localhost:5432/mydb";
			const poolSize = Number(process.env["DATABASE_POOL_SIZE"] ?? 10);
			return createPostgresMoviesRepo(
				createPostgresClient(url, Number.isFinite(poolSize) && poolSize > 0 ? poolSize : 10),
			);
		}

		case "turso": {
			// Prefer TURSO_URL; do NOT fall back to DATABASE_URL (may be a
			// Postgres/Neon URL from another dialect's config). Default to local.
			// TURSO_URL decides local (`file://`) vs cloud (`libsql://`).
			const url =
				process.env["TURSO_URL"] ??
				process.env["TURSO_DB_URL"] ??
				`file:///${resolve(process.cwd(), "tursodb.db")}`;
			const authToken =
				process.env["TURSO_AUTH_TOKEN"] ?? process.env["TURSO_TOKEN"];
			return createTursoMoviesRepo(createTursoClient({ url, authToken }));
		}

		case "d1":
			throw new Error(
				"`DATABASE_TYPE=d1` has no local driver. Use `bun run worker:dev` " +
					"or set a local dialect (`sqlite` / `postgres` / `neon` / `turso`).",
			);

		case "sqlite":
		default:
			return createSqliteMoviesRepo();
	}
}
