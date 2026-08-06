/**
 * Seed the movies table for the active `DATABASE_TYPE`.
 *
 * The dialect comes from the active env:
 *   - **default (prod)**  -> `.env` (auto-loaded by Bun).
 *   - **`--dev`**         -> the matching `.env.dev.<type>` (via the
 *     `src/macros/dev-env.ts` macro).
 *
 * Dispatches to the matching client/schema:
 *   - `sqlite` / `d1`        -> bun:sqlite, `src/db/schema/sqlite`
 *   - `turso`                -> @libsql/client, `src/db/schema/sqlite`
 *   - `postgres` / `neon`    -> postgres-js, `src/db/schema/postgres`
 *
 * Usage:
 *   bun run db:seed                  # seed the active DATABASE_TYPE (.env)
 *   bun run db:seed --dev            # seed using .env.dev.<type>
 *   DATABASE_TYPE=neon bun run db:seed  # force neon/postgres
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
	console.log(`[db:seed] --dev → env-file=${devFile}`);
}

function activeDialect(): string {
	const type = (process.env["DATABASE_TYPE"] ?? "sqlite").toLowerCase();
	if (type === "postgres" || type === "postgresql" || type === "pg")
		return "postgres";
	if (type === "neon") return "neon";
	if (type === "turso" || type === "tursodb" || type === "turso-cloud")
		return "turso";
	if (type === "d1") return "d1";
	return "sqlite";
}

const seedRows = [
	{ title: "The Matrix", releaseYear: 1999 },
	{ title: "The Matrix Reloaded", releaseYear: 2003 },
	{ title: "The Matrix Revolutions", releaseYear: 2003 },
];

const dialect = activeDialect();

switch (dialect) {
	case "sqlite":
	case "d1": {
		const { Database } = await import("bun:sqlite");
		const { drizzle } = await import("drizzle-orm/bun-sqlite");
		const { movies } = await import("../src/db/schema/sqlite");

		const db = drizzle(new Database("sqlite.db"));
		await db.insert(movies).values(seedRows);
		console.log(`Seeding complete (sqlite/d1 → sqlite.db).`);
		break;
	}

	case "turso": {
		const { createClient } = await import("@libsql/client");
		const { drizzle } = await import("drizzle-orm/libsql");
		const { movies } = await import("../src/db/schema/sqlite");

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
		await db.insert(movies).values(seedRows);
		console.log(`Seeding complete (turso → ${url}).`);
		break;
	}

	case "postgres":
	case "neon": {
		const postgres = (await import("postgres")).default;
		const { drizzle } = await import("drizzle-orm/postgres-js");
		const { movies } = await import("../src/db/schema/postgres");

		const url =
			process.env["DATABASE_URL"] ??
			process.env["DATABASE_URL_UNPOOLED"] ??
			"postgres://postgres:postgres@localhost:5432/mydb";
		const client = postgres(url, { max: 1 });
		const db = drizzle(client);
		await db.insert(movies).values(seedRows);
		await client.end();
		console.log(`${dialect === "neon" ? "Neon" : "Postgres"} seeding complete.`);
		break;
	}
}
