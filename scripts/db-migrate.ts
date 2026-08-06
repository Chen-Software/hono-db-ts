/**
 * Dispatches the migration to the dialect selected by `DATABASE_TYPE`
 * (build-time value in `src/macros/db.ts`).
 *
 *   - `sqlite` (default)   -> `drizzle/sqlite`  (local `sqlite.db`)
 *   - `postgres` / `neon`  -> `drizzle/postgres` (local Postgres or Neon)
 *   - `d1`                 -> error: D1 has no local migrator; use `wrangler d1`
 *
 * Usage:
 *   bun run db:migrate                      # sqlite (default)
 *   DATABASE_TYPE=neon bun run db:migrate   # neon/postgres
 *   bun run --env-file=.env.neon db:migrate # neon (reads DATABASE_URL)
 */

import type { DbDialect } from "../src/macros/db";

function activeDialect(): DbDialect {
	const type = (process.env["DATABASE_TYPE"] ?? "sqlite").toLowerCase();
	if (type === "postgres" || type === "postgresql" || type === "pg")
		return "postgres";
	if (type === "neon") return "neon";
	if (type === "d1") return "d1";
	return "sqlite";
}

const dialect = activeDialect();

switch (dialect) {
	case "sqlite": {
		const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");
		const { drizzle } = await import("drizzle-orm/bun-sqlite");
		const { Database } = await import("bun:sqlite");

		// Use the SQLite file path only — the shared `DATABASE_URL` may point at a
		// Postgres/Neon server when another dialect's config is loaded.
		const rawUrl = process.env["DATABASE_URL"] ?? "sqlite.db";
		const isPostgresUrl =
			rawUrl.startsWith("postgres://") || rawUrl.startsWith("postgresql://");
		const url = isPostgresUrl ? "sqlite.db" : rawUrl;
		const sqlite = new Database(url);
		sqlite.exec("PRAGMA foreign_keys = ON;");
		sqlite.exec("PRAGMA journal_mode = WAL;");
		const db = drizzle(sqlite);
		migrate(db, { migrationsFolder: "./drizzle/sqlite" });
		console.log(`SQLite migrations applied to ${url}`);
		break;
	}

	case "postgres":
	case "neon": {
		const { migrate } = await import("drizzle-orm/postgres-js/migrator");
		const { drizzle } = await import("drizzle-orm/postgres-js");
		const postgres = (await import("postgres")).default;

		const url =
			process.env["DATABASE_URL"] ??
			"postgres://postgres:postgres@localhost:5432/mydb";
		const client = postgres(url, { max: 1 });
		const db = drizzle(client);
		await migrate(db, { migrationsFolder: "./drizzle/postgres" });
		await client.end();
		console.log(`${dialect === "neon" ? "Neon" : "Postgres"} migrations applied`);
		break;
	}

	case "d1":
		throw new Error(
			"`DATABASE_TYPE=d1` has no local migrator. Apply D1 migrations with " +
				"`bun x wrangler d1 migrations apply movies-db` instead.",
		);
}
