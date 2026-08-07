/**
 * Postgres schema — the `movies` table, defined independently for
 * `drizzle-orm/pg-core`.
 *
 * Fully self-contained: it defines its own table and derives its own Zod
 * schemas, so it can use Postgres-native features the SQLite variant cannot:
 * - `id` as a `GENERATED ALWAYS AS IDENTITY` primary key
 * - a `CHECK` constraint on `release_year` (the first feature film was 1888)
 *
 * The exposed column set and Zod schemas mirror the SQLite variant so the
 * storage-agnostic `TableRepo` / routes keep a single API surface.
 */

import { sql } from "drizzle-orm";
import { check, integer, pgTable, text } from "drizzle-orm/pg-core";
import {
	createInsertSchema,
	createSelectSchema,
	createUpdateSchema,
} from "drizzle-zod";
import { z } from "zod";

export const movies = pgTable(
	"movies",
	{
		id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
		title: text("name"),
		releaseYear: integer("release_year"),
	},
	(table) => [
		check("movies_release_year_check", sql`${table.releaseYear} >= 1888`),
	],
);

// The `id` column is a `GENERATED ALWAYS AS IDENTITY` primary key, so
// `createInsertSchema` / `createUpdateSchema` already exclude it — no
// `.omit({ id: true })` is needed (unlike the SQLite variant).

// Zod schemas derived from the `movies` table.
// See https://orm.drizzle.team/docs/zod

// Validate data read from the DB / returned by the API
export const movieSelectSchema = createSelectSchema(movies, {
	// extend the generated schema — title must be a non-empty string
	title: (schema) => schema.min(1, "title must not be empty"),
});

// Validate data used to create a movie (POST body)
export const movieInsertSchema = createInsertSchema(movies, {
	// override title with a required (non-nullable) schema since the DB column
	// is optional — reject whitespace-only titles, then trim the stored value
	title: z
		.string("title is required")
		.refine((value) => value.trim().length > 0, "title must not be empty")
		.transform((value) => value.trim()),
	releaseYear: (schema) => schema.int("releaseYear must be an integer"),
});

// Validate data used to update a movie (PUT body) — all fields optional
export const movieUpdateSchema = createUpdateSchema(movies, {
	// override title with an optional, non-nullable string schema since the DB
	// column is nullable — reject whitespace-only titles, then trim the value
	title: z
		.string("title must be a string")
		.refine((value) => value.trim().length > 0, "title must not be empty")
		.transform((value) => value.trim())
		.optional(),
	releaseYear: (schema) => schema.int("releaseYear must be an integer"),
});

// Validate a `:id` path parameter
export const movieIdSchema = z.coerce
	.number()
	.int("id must be an integer")
	.positive("id must be positive");

/** Named-schema object for `drizzle(..., { schema })`. */
export const schema = { movies };

export const validators = {
	movieIdSchema,
	movieSelectSchema,
	movieInsertSchema,
	movieUpdateSchema,
};
