/**
 * Movie schema & derived Zod schemas.
 *
 * Re-exports the SQLite variant (`sqlite.ts`) so application code keeps a
 * short import path (`src/db/schema`). The Postgres variant lives in
 * `postgres.ts`.
 */

export {
	movieIdSchema,
	movieInsertSchema,
	movieSelectSchema,
	movies,
	movieUpdateSchema,
} from "./sqlite";
