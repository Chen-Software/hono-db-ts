/**
 * Single source of truth for the `movies` table, defined once for each
 * supported dialect (SQLite + Postgres).
 *
 * The two definitions share identical column names and shapes, so the zod
 * schemas below are derived from the SQLite table and apply to both dialects.
 * `sqlite.ts` / `postgres.ts` compile these into their concrete Drizzle
 * clients and re-export the tables so drizzle-kit can discover them.
 */

import {
	integer as pgInteger,
	pgTable,
	text as pgText,
} from "drizzle-orm/pg-core";
import {
	integer as sqliteInteger,
	sqliteTable,
	text as sqliteText,
} from "drizzle-orm/sqlite-core";
import {
	createInsertSchema,
	createSelectSchema,
	createUpdateSchema,
} from "drizzle-zod";
import { z } from "zod";

/** `movies` table — SQLite / D1. */
export const sqliteMovies = sqliteTable("movies", {
	id: sqliteInteger("id").primaryKey(),
	title: sqliteText("name"),
	releaseYear: sqliteInteger("release_year"),
});

/** `movies` table — Postgres. */
export const pgMovies = pgTable("movies", {
	id: pgInteger("id").primaryKey(),
	title: pgText("name"),
	releaseYear: pgInteger("release_year"),
});

// Zod schemas derived from the `movies` table.
// See https://orm.drizzle.team/docs/zod

// Validate data read from the DB / returned by the API
export const movieSelectSchema = createSelectSchema(sqliteMovies, {
	// extend the generated schema — title must be a non-empty string
	title: (schema) => schema.min(1, "title must not be empty"),
});

// Validate data used to create a movie (POST body)
export const movieInsertSchema = createInsertSchema(sqliteMovies, {
	// override title with a required (non-nullable) schema since the DB column
	// is optional — reject whitespace-only titles, then trim the stored value
	title: z
		.string("title is required")
		.refine((value) => value.trim().length > 0, "title must not be empty")
		.transform((value) => value.trim()),
	releaseYear: (schema) => schema.int("releaseYear must be an integer"),
}).omit({ id: true });

// Validate data used to update a movie (PUT body) — all fields optional
export const movieUpdateSchema = createUpdateSchema(sqliteMovies, {
	// override title with an optional, non-nullable string schema since the DB
	// column is nullable — reject whitespace-only titles, then trim the value
	title: z
		.string("title must be a string")
		.refine((value) => value.trim().length > 0, "title must not be empty")
		.transform((value) => value.trim())
		.optional(),
	releaseYear: (schema) => schema.int("releaseYear must be an integer"),
}).omit({ id: true });

// Validate a `:id` path parameter
export const movieIdSchema = z.coerce
	.number()
	.int("id must be an integer")
	.positive("id must be positive");
