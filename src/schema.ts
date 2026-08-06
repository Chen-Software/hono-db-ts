import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import {
	createInsertSchema,
	createSelectSchema,
	createUpdateSchema,
} from "drizzle-zod";
import { z } from "zod";

export const movies = sqliteTable("movies", {
	id: integer("id").primaryKey(),
	title: text("name"),
	releaseYear: integer("release_year"),
});

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
}).omit({ id: true });

// Validate data used to update a movie (PUT body) — all fields optional
export const movieUpdateSchema = createUpdateSchema(movies, {
	// reject whitespace-only titles, then trim the stored value
	title: (schema) =>
		schema
			.refine((value) => value.trim().length > 0, "title must not be empty")
			.transform((value) => value.trim()),
	releaseYear: (schema) => schema.int("releaseYear must be an integer"),
}).omit({ id: true });

// Validate a `:id` path parameter
export const movieIdSchema = z.coerce
	.number()
	.int("id must be an integer")
	.positive("id must be positive");
