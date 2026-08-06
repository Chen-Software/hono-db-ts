import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { movies } from "../db/schema";
import { createSqliteClient } from "../db/sqlite-client";
import type { SqliteDb } from "../db/sqlite-client";
import type { Movie, MoviesRepo } from "./movies-repo";

/**
 * The Drizzle SQLite database shape this repo needs (sync, like `bun:sqlite`).
 */
export type SqliteRepoDb = BaseSQLiteDatabase<"sync", void, { movies: typeof movies }>;

/**
 * Build a SQLite movies repo. Accepts a client for build-time injection
 * (see `src/repo/factory.ts`); defaults to a local `sqlite.db` client when
 * called without one (e.g. tests).
 */
export function createSqliteMoviesRepo(db: SqliteDb = createSqliteClient("sqlite.db")): MoviesRepo {
	return {
		async list() {
			return db.select().from(movies).all();
		},

		async get(id) {
			return db.select().from(movies).where(eq(movies.id, id)).get() ?? null;
		},

		async create(input) {
			// bun:sqlite's .run() returns a Changes object at runtime, but the
			// Drizzle type is void — cast to read the inserted row id.
			const result = db
				.insert(movies)
				.values({
					title: input.title,
					releaseYear: input.releaseYear,
				})
				.run() as unknown as { lastInsertRowid: number | bigint };

			const row = db
				.select()
				.from(movies)
				.where(eq(movies.id, Number(result.lastInsertRowid)))
				.get();

			// lastInsertRowid always resolves to a real row right after insert
			return row!;
		},

		async update(id, updates) {
			const existing = db.select().from(movies).where(eq(movies.id, id)).get();
			if (!existing) {
				return null;
			}

			db.update(movies).set(updates).where(eq(movies.id, id)).run();

			return db.select().from(movies).where(eq(movies.id, id)).get() ?? null;
		},

		async remove(id) {
			const existing = db.select().from(movies).where(eq(movies.id, id)).get();
			if (!existing) {
				return false;
			}

			db.delete(movies).where(eq(movies.id, id)).run();
			return true;
		},
	};
}

export type { Movie };
