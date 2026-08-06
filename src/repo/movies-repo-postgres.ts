import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as pgSchema from "../db/schema/postgres";
import type { Movie, MoviesRepo } from "./movies-repo";

/**
 * Build a movies repository backed by a Postgres client.
 *
 * Unlike the SQLite variant, `id` is a `GENERATED ALWAYS AS IDENTITY` primary
 * key, so inserts use `.returning()` (the D1 repo does the same) rather than
 * reading `lastInsertRowid`.
 */
export function createPostgresMoviesRepo(
	db: PostgresJsDatabase<typeof pgSchema.schema>,
): MoviesRepo {
	return {
		async list() {
			return db.select().from(pgSchema.movies);
		},

		async get(id) {
			const [row] = await db
				.select()
				.from(pgSchema.movies)
				.where(eq(pgSchema.movies.id, id));
			return row ?? null;
		},

		async create(input) {
			const [movie] = await db
				.insert(pgSchema.movies)
				.values({
					title: input.title,
					releaseYear: input.releaseYear,
				})
				.returning();

			// .returning() always yields the inserted row
			return movie!;
		},

		async update(id, updates) {
			const [row] = await db
				.select()
				.from(pgSchema.movies)
				.where(eq(pgSchema.movies.id, id));
			if (!row) {
				return null;
			}

			const [movie] = await db
				.update(pgSchema.movies)
				.set(updates)
				.where(eq(pgSchema.movies.id, id))
				.returning();

			return movie ?? null;
		},

		async remove(id) {
			const [row] = await db
				.select()
				.from(pgSchema.movies)
				.where(eq(pgSchema.movies.id, id));
			if (!row) {
				return false;
			}

			await db.delete(pgSchema.movies).where(eq(pgSchema.movies.id, id));
			return true;
		},
	};
}

export type { Movie };
