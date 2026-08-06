/**
 * Build the storage-agnostic repository for the active dialect.
 *
 * Uses Bun macros (`src/macros/db-client.ts`, `src/macros/db-repo.ts`) that
 * inline the module specifiers of the active dialect's client + repo at build
 * time. The static `await import(<literal>)` lets the bundler resolve them and
 * **tree-shake away every other dialect's driver** — so a `d1` build does not
 * bundle `@libsql/client`, and a `turso` build does not bundle `postgres`, etc.
 *
 * Used by the local Bun entry (`main.ts`). The Worker entry (`src/worker.ts`)
 * selects D1 vs Neon from bindings instead.
 */

import type { MoviesRepo } from "./movies-repo";
import type { SqliteDb } from "../db/sqlite-client";
import type { PostgresDb } from "../db/postgres-client";
import type { TursoDb } from "../db/turso-client";
import { clientModule } from "../macros/db-client" with { type: "macro" };
import { repoModule } from "../macros/db-repo" with { type: "macro" };

type ClientModule = { createClientFromEnv: () => unknown };
type RepoModule = Record<string, (db: unknown) => MoviesRepo>;

/**
 * Build the repo for the active dialect. Async because it statically imports
 * the dialect-specific client + repo modules (resolved + tree-shaken at build).
 */
export async function createRepo(): Promise<MoviesRepo> {
	const clientMod = (await import(clientModule())) as ClientModule;
	const repoMod = (await import(repoModule())) as RepoModule;

	const db = clientMod.createClientFromEnv();

	// Each repo module exports exactly one `create<X>MoviesRepo` factory.
	for (const [name, factory] of Object.entries(repoMod)) {
		if (typeof factory === "function" && name.startsWith("create") && name.endsWith("MoviesRepo")) {
			return factory(db);
		}
	}
	throw new Error(`No repo factory found in ${repoModule()}`);
}

export type { SqliteDb, PostgresDb, TursoDb };
