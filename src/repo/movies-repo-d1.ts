import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../schema";
import type { Movie, MoviesRepo } from "./movies-repo";

/**
 * Build a movies repository backed by a Cloudflare D1 binding.
 */
export function createD1MoviesRepo(d1: D1Database): MoviesRepo {
	const db = drizzle(d1, { schema });

	return {
		async list() {
			return db.select().from(schema.movies).all();
		},

		async get(id) {
			const row = await db
				.select()
				.from(schema.movies)
				.where(eq(schema.movies.id, id))
				.get();
			return row ?? null;
		},

		async create(input) {
			const [movie] = await db
				.insert(schema.movies)
				.values({
					title: input.title,
					releaseYear: input.releaseYear,
				})
				.returning();

			// .returning() always yields the inserted row
			return movie!;
		},

		async update(id, updates) {
			const existing = await db
				.select()
				.from(schema.movies)
				.where(eq(schema.movies.id, id))
				.get();
			if (!existing) {
				return null;
			}

			const [movie] = await db
				.update(schema.movies)
				.set(updates)
				.where(eq(schema.movies.id, id))
				.returning();

			return movie ?? null;
		},

		async remove(id) {
			const existing = await db
				.select()
				.from(schema.movies)
				.where(eq(schema.movies.id, id))
				.get();
			if (!existing) {
				return false;
			}

			await db.delete(schema.movies).where(eq(schema.movies.id, id)).run();
			return true;
		},
	};
}

export type { Movie };
