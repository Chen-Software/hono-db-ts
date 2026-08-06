import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { movies } from "../db/schema";
import type { Movie, MoviesRepo } from "./movies-repo";

/**
 * Turso database type — `LibSQLDatabase` is an **async** SQLite client
 * (`BaseSQLiteDatabase<"async", ResultSet, ...>`), unlike `bun:sqlite` which is
 * sync. So every query below is awaited.
 */
export type TursoRepoDb = LibSQLDatabase<{ movies: typeof movies }>;

/**
 * Build a movies repository over a Turso (libSQL) client. Works for both
 * local TursoDB (`file://` URL) and Turso Cloud (`libsql://` + token).
 */
export function createTursoMoviesRepo(db: TursoRepoDb): MoviesRepo {
	return {
		async list() {
			return db.select().from(movies).all();
		},

		async get(id) {
			return (await db.select().from(movies).where(eq(movies.id, id)).get()) ?? null;
		},

		async create(input) {
			// libSQL's async .run() resolves a ResultSet with lastInsertRowid.
			const result = await db
				.insert(movies)
				.values({
					title: input.title,
					releaseYear: input.releaseYear,
				})
				.run();

			const lastId = Number(result.lastInsertRowid);
			const row = await db
				.select()
				.from(movies)
				.where(eq(movies.id, lastId))
				.get();
			// lastInsertRowid always resolves to a real row right after insert
			return row!;
		},

		async update(id, updates) {
			const existing = await db
				.select()
				.from(movies)
				.where(eq(movies.id, id))
				.get();
			if (!existing) {
				return null;
			}

			await db.update(movies).set(updates).where(eq(movies.id, id)).run();
			return (
				(await db.select().from(movies).where(eq(movies.id, id)).get()) ?? null
			);
		},

		async remove(id) {
			const existing = await db
				.select()
				.from(movies)
				.where(eq(movies.id, id))
				.get();
			if (!existing) {
				return false;
			}

			await db.delete(movies).where(eq(movies.id, id)).run();
			return true;
		},
	};
}

export type { Movie };
