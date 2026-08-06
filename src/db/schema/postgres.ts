/**
 * Postgres schema — the movie example from `factory.ts` compiled against
 * `drizzle-orm/pg-core`. Re-export the table so drizzle-kit can discover it,
 * plus a `schema` object for the Drizzle client.
 */

import { pgMovies } from "./factory";

export {
	movieIdSchema,
	movieInsertSchema,
	movieSelectSchema,
	movieUpdateSchema,
} from "./factory";

/** Alias so application code can keep using `movies`. */
export const movies = pgMovies;

/** Named-schema object for `drizzle(..., { schema })`. */
export const schema = { movies: pgMovies };
