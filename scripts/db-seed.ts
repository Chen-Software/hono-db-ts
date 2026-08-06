/**
 * Seed the movies table for the active `DATABASE_TYPE`.
 *
 * The dialect comes from the active env:
 *   - **default (prod)**  -> `.env` (auto-loaded by Bun).
 *   - **`--dev`**         -> the matching `.env.dev.<type>` (via the
 *     `src/macros/dev-env.ts` macro).
 *
 * Where the seed goes:
 *   - `d1` (prod, default)  -> **remote** Cloudflare D1 via `wrangler d1 execute
 *     --remote`. `d1` + `--dev` seeds the local `sqlite.db` instead.
 *   - `sqlite`              -> local `sqlite.db`.
 *   - `turso`               -> @libsql/client, `src/db/schema/sqlite`.
 *   - `postgres` / `neon`   -> postgres-js, `src/db/schema/postgres`.
 *
 * Usage:
 *   bun run db:seed                  # seed the active DATABASE_TYPE (.env)
 *   bun run db:seed --dev            # seed using .env.dev.<type> (local)
 *   DATABASE_TYPE=neon bun run db:seed  # force neon/postgres
 */

import { dbDialect } from "../src/macros/db-dialect" with { type: "macro" };
import {
	devEnvFile,
	loadEnvFile as loadDevEnv,
} from "../src/macros/dev-env" with { type: "macro" };
import { seedRemoteD1 } from "./remotes/d1";
import { seedRemoteTurso } from "./remotes/turso";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { movies } from "../src/db/schema/sqlite";

const isDev = process.argv.includes("--dev");

// In --dev mode, load the matching .env.dev.<type> via the env macro (its
// DATABASE_TYPE then drives the dialect below). Dev values override the
// auto-loaded `.env` (e.g. the local `file:tursodb.db` URL replaces the cloud
// `libsql://` URL). Otherwise use the auto-loaded `.env`.
if (isDev) {
	const devFile = devEnvFile();
	const devVars = loadDevEnv(devFile);
	for (const [k, v] of Object.entries(devVars)) {
		process.env[k] = v;
	}
	console.log(`[db:seed] --dev → env-file=${devFile}`);
}

const seedRows = [
	{ title: "The Matrix", releaseYear: 1999 },
	{ title: "The Matrix Reloaded", releaseYear: 2003 },
	{ title: "The Matrix Revolutions", releaseYear: 2003 },
];

const dialect = dbDialect();

switch (dialect) {
	case "sqlite":
	case "d1": {
		// d1 in prod (no --dev) seeds the REMOTE Cloudflare D1 database.
		if (dialect === "d1" && !isDev) {
			seedRemoteD1(seedRows);
			break;
		}

		const db = drizzle(new Database("sqlite.db"));
		await db.insert(movies).values(seedRows);
		console.log(`Seeding complete (sqlite/d1 → sqlite.db).`);
		break;
	}

	case "turso": {
		const client = await seedRemoteTurso(seedRows);
		client.close();
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
