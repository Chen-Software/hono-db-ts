import { eq } from "drizzle-orm";
import { db } from "../db";
import { movies } from "../schema";
import type { Movie, MoviesRepo } from "./movies-repo";

export function createSqliteMoviesRepo(): MoviesRepo {
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
