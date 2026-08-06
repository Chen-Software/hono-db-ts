import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import type { Movie, MoviesRepo } from "./movies-repo";

/**
 * Build a movies repository backed by a Drizzle D1 client (created from a
 * Cloudflare D1 binding via `createClient({ d1: env.DB })` — see
 * https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1).
 */
export function createD1MoviesRepo(
	db: DrizzleD1Database<typeof schema>,
): MoviesRepo {
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
