/**
 * Seed the remote Cloudflare D1 database with sample movies.
 *
 * The seed data lives in `drizzle/seed.sql`. Apply it to D1 with:
 *
 * ```bash
 * bun run db:seed:d1
 * ```
 *
 * which runs:
 * ```bash
 * bun x wrangler d1 execute movies-db --remote --file ./drizzle/seed.sql
 * ```
 *
 * NOTE: this script is a thin documentation wrapper — the actual seeding is
 * done by `wrangler d1 execute` against the remote DB. The reference
 * `seedD1(d1)` helper below shows the equivalent in-Worker implementation for
 * when a `D1Database` binding is available (e.g. an admin route).
 */
export async function seedD1(d1: D1Database): Promise<void> {
	const { drizzle } = await import("drizzle-orm/d1");
	const schema = await import("../src/db/schema");

	const db = drizzle(d1, { schema });

	await db
		.insert(schema.movies)
		.values([
			{ title: "The Matrix", releaseYear: 1999 },
			{ title: "The Matrix Reloaded", releaseYear: 2003 },
			{ title: "The Matrix Revolutions", releaseYear: 2003 },
		])
		.run();

	console.log("Seeding complete.");
}
