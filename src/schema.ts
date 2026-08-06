/**
 * Movie schema & derived Zod schemas.
 *
 * Re-exported from `src/db/schema/sqlite.ts` (single source of truth in
 * `src/db/schema/factory.ts`) so application code keeps a short import path.
 */

export {
	movieIdSchema,
	movieInsertSchema,
	movieSelectSchema,
	movies,
	movieUpdateSchema,
} from "./db/schema/sqlite";
