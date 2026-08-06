import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as pgSchema from "../db/schema/postgres";
import type { Movie, MoviesRepo } from "./movies-repo";

/**
 * The minimal Drizzle Postgres database shape needed by this repo. Both the
 * local `postgres-js` client and the Worker's `neon-serverless` client satisfy
 * it, so a single repo backs Postgres and Neon.
 */
type PgRepoDb = PgDatabase<PgQueryResultHKT, typeof pgSchema.schema>;

/**
 * Build a movies repository backed by a Postgres-compatible client (Postgres
 * locally, or Neon via Hyperdrive in the Worker).
 *
 * Unlike the SQLite variant, `id` is a `GENERATED ALWAYS AS IDENTITY` primary
 * key, so inserts use `.returning()` (the D1 repo does the same) rather than
 * reading `lastInsertRowid`.
 */
export function createPostgresMoviesRepo(db: PgRepoDb): MoviesRepo {
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
