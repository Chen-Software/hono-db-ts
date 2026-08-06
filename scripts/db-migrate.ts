/**
 * Dispatches the migration to the dialect selected by `DATABASE_TYPE`.
 *
 * The dialect comes from the active env:
 *   - **default (prod)**  -> `.env` (auto-loaded by Bun).
 *   - **`--dev`**         -> the matching `.env.dev.<type>` (via the
 *     `src/macros/dev-env.ts` macro), e.g. `.env.dev.neon` → local Postgres.
 *
 *   - `sqlite`            -> `drizzle/sqlite`  (local `sqlite.db`)
 *   - `postgres` / `neon` -> `drizzle/postgres` (local Postgres or Neon)
 *   - `turso`             -> `drizzle/sqlite` (Turso reuses SQLite schema)
 *   - `d1`                -> error: D1 has no local migrator; use `wrangler d1`
 *
 * Usage:
 *   bun run db:migrate                  # migrate the active DATABASE_TYPE (.env)
 *   bun run db:migrate --dev            # migrate using .env.dev.<type>
 *   DATABASE_TYPE=neon bun run db:migrate   # force neon/postgres (prod)
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dbDialect } from "../src/macros/db-dialect" with { type: "macro" };
import { devEnvFile } from "../src/macros/dev-env" with { type: "macro" };

const isDev = process.argv.includes("--dev");

/** Merge a `.env`-style file into `process.env` (does not override existing). */
function loadEnvFile(file: string): void {
	try {
		for (const line of readFileSync(file, "utf8").split("\n")) {
			const t = line.trim();
			if (!t || t.startsWith("#") || !t.includes("=")) continue;
			const eq = t.indexOf("=");
			const key = t.slice(0, eq).trim();
			let value = t.slice(eq + 1).trim();
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}
			if (process.env[key] === undefined) process.env[key] = value;
		}
	} catch {
		// file may not exist
	}
}

// In --dev mode, load the matching .env.dev.<type> (its DATABASE_TYPE then
// drives the dialect below). Otherwise use the auto-loaded .env.
if (isDev) {
	const devFile = devEnvFile();
	loadEnvFile(resolve(process.cwd(), devFile));
	console.log(`[db:migrate] --dev → env-file=${devFile}`);
}

const dialect = dbDialect();

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

	case "turso": {
		const { migrate } = await import("drizzle-orm/libsql/migrator");
		const { drizzle } = await import("drizzle-orm/libsql");
		const { createClient } = await import("@libsql/client");

		// Prefer TURSO_URL; do NOT fall back to DATABASE_URL (it may point at a
		// Postgres/Neon URL from another dialect's config). Default to a local file.
		// TURSO_URL decides local (`file://`) vs cloud (`libsql://`).
		const url =
			process.env["TURSO_URL"] ??
			`file:///${resolve(process.cwd(), "tursodb.db")}`;
		const authToken =
			process.env["TURSO_AUTH_TOKEN"] ?? process.env["TURSO_TOKEN"];
		const client = createClient({
			url,
			...(authToken ? { authToken } : {}),
		});
		const db = drizzle(client);
		await migrate(db, { migrationsFolder: "./drizzle/sqlite" });
		const kind = url.startsWith("file:") ? "TursoDB" : "Turso Cloud";
		console.log(`${kind} migrations applied to ${url}`);
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
