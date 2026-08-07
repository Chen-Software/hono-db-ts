import { eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { schemas } from "../db/schema";
import * as pgSchema from "../db/schema/postgres";

const {movies} = schemas;

export type Movie = InferSelectModel<typeof moviesSqlite>;

export interface CreateMovieInput {
	title: string;
	releaseYear: number | null;
}

export interface UpdateMovieInput {
	title?: string;
	releaseYear?: number | null;
}

/**
 * Storage-agnostic repository for movies.
 * All methods are async so a single interface can back both the local
 * bun:sqlite driver and Cloudflare D1.
 */
export interface MoviesRepo {
	list(): Promise<Movie[]>;
	get(id: number): Promise<Movie | null>;
	create(input: CreateMovieInput): Promise<Movie>;
	update(id: number, updates: UpdateMovieInput): Promise<Movie | null>;
	remove(id: number): Promise<boolean>;
}

/**
 * The minimal SQLite-family database shape this repo needs. `sync` databases
 * (`bun:sqlite`) and `async` databases (`@libsql/client`, `drizzle-orm/d1`) all
 * satisfy it, so a single repo backs local sqlite, Turso, and Cloudflare D1.
 *
 * NOTE: queries are written with `await`; `await` on a sync (non-Promise) result
 * resolves immediately, so the same code works for both sync and async drivers.
 */
export type SqliteRepoDb = BaseSQLiteDatabase<
	"sync" | "async",
	unknown,
	{ movies: typeof moviesSqlite }
>;

/**
 * Build a movies repository over a SQLite-family client (local `bun:sqlite`,
 * Turso/libSQL, or Cloudflare D1). Insert uses `.run()` + `lastInsertRowid`.
 */
export function createSqliteMoviesRepo(db: SqliteRepoDb): MoviesRepo {
	return {
		async list() {
			return db.select().from(moviesSqlite).all();
		},

		async get(id) {
			const row = await db
				.select()
				.from(moviesSqlite)
				.where(eq(moviesSqlite.id, id))
				.get();
			return row ?? null;
		},

		async create(input) {
			// .run() returns { lastInsertRowid } for all SQLite drivers (sync via
			// bun:sqlite, async via libsql / d1).
			const result = (await db
				.insert(moviesSqlite)
				.values({
					title: input.title,
					releaseYear: input.releaseYear,
				})
				.run()) as unknown as { lastInsertRowid: number | bigint };

			const row = await db
				.select()
				.from(moviesSqlite)
				.where(eq(moviesSqlite.id, Number(result.lastInsertRowid)))
				.get();
			// lastInsertRowid always resolves to a real row right after insert
			return row!;
		},

		async update(id, updates) {
			const existing = await db
				.select()
				.from(moviesSqlite)
				.where(eq(moviesSqlite.id, id))
				.get();
			if (!existing) {
				return null;
			}

			await db
				.update(moviesSqlite)
				.set(updates)
				.where(eq(moviesSqlite.id, id))
				.run();
			return (
				(await db
					.select()
					.from(moviesSqlite)
					.where(eq(moviesSqlite.id, id))
					.get()) ?? null
			);
		},

		async remove(id) {
			const existing = await db
				.select()
				.from(moviesSqlite)
				.where(eq(moviesSqlite.id, id))
				.get();
			if (!existing) {
				return false;
			}

			await db.delete(moviesSqlite).where(eq(moviesSqlite.id, id)).run();
			return true;
		},
	};
}

/** The minimal Postgres database shape needed (Postgres + Neon). */
type PgRepoDb = PgDatabase<PgQueryResultHKT, typeof pgSchema.schema>;

/**
 * Build a movies repository backed by a Postgres-compatible client (Postgres
 * locally, or Neon via Hyperdrive in the Worker). Uses `.returning()` because
 * the id is a `GENERATED ALWAYS AS IDENTITY` primary key.
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
