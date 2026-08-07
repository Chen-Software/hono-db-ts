/**
 * Seed the movies table for the active `DATABASE_TYPE`.
 *
 * Seeding uses the unified `src/db/client.ts` `createClient()`, which
 * auto-selects remote vs local based on `NODE_ENV`:
 *   - **`--dev`**            -> sets `NODE_ENV=development`; `createClient()`
 *     loads `.env.dev.<type>` (via the `src/macros/dev-env.ts` macro) and returns
 *     the LOCAL dev client.
 *   - **default (prod)**     -> remote client from `.env` (Turso Cloud, Neon).
 *
 * The only exception is `d1` in prod: D1 is a Worker binding with no client
 * object, so it seeds the remote D1 via `wrangler d1 execute --remote`
 * (a D1-only fallback local to this script). `d1` + `--dev` falls through to the
 * local sqlite client (via `.env.dev.d1`, which sets `DATABASE_TYPE=sqlite`).
 *
 * Usage:
 *   bun run db:seed                  # seed the active DATABASE_TYPE (.env)
 *   bun run db:seed --dev            # seed using .env.dev.<type> (local)
 *   DATABASE_TYPE=neon bun run db:seed  # force neon/postgres
 */

import { execSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { dbDialect } from "../src/macros/db-dialect" with { type: "macro" };
import {
	client,
	type DbClient,
	type PostgresDb,
	type SqliteDb,
	type TursoDb,
} from "../src/db/client";
import { schemas } from "../src/db/schema";
import * as sqliteSchema from "../src/db/schema/sqlite";

const isDev = process.argv.includes("--dev");

// --dev → development mode: `createClient()` loads `.env.dev.<type>` and
// returns the local dev client.
if (isDev) {
	process.env["NODE_ENV"] = "development";
}

const seedRows = [
	{ title: "The Matrix", releaseYear: 1999 },
	{ title: "The Matrix Reloaded", releaseYear: 2003 },
	{ title: "The Matrix Revolutions", releaseYear: 2003 },
];

/** Mint a fresh Turso token via the CLI when none is present in env. */
function ensureTursoToken(): void {
	const url = process.env["TURSO_URL"];
	if (!url || process.env["TURSO_AUTH_TOKEN"] || process.env["TURSO_TOKEN"]) {
		return; // local file URL, or a token already provided
	}
	const isLocal = url.startsWith("file:");
	if (isLocal) return; // local file needs no token
	const list = execSync("turso db list", { encoding: "utf8" }).toString();
	let db = "";
	let group = "";
	for (const row of list.split("\n")) {
		const cols = row.trim().split(/\s+/);
		if (cols.length >= 3 && cols[cols.length - 1] === url) {
			db = cols[0] ?? "";
			group = cols[2] ?? "";
			break;
		}
	}
	const command = group
		? `turso group tokens create ${group}`
		: `turso db tokens create ${db}`;
	const token = execSync(command, { encoding: "utf8" }).trim().split("\n").pop();
	if (token) process.env["TURSO_AUTH_TOKEN"] = token;
}

/** Escape a string literal for SQL (single quotes doubled). */
function sqlLit(value: string | number): string {
	return typeof value === "number" ? String(value) : `'${value.replace(/'/g, "''")}'`;
}

/**
 * Seed the **remote** Cloudflare D1 database via `wrangler d1 execute --remote`.
 *
 * D1 has no client object outside a Worker (it's a `D1Database` binding), so a
 * local/CLI process cannot build one with `createClient()`. This is therefore a
 * D1-only fallback: it runs the INSERT statements against the remote D1 through
 * the Wrangler CLI.
 *
 * @param rows seed rows conforming to the SQLite movies schema.
 */
function seedRemoteD1(rows: { title: string; releaseYear: number }[]): void {
	const dbName = process.env["D1_DATABASE_NAME"] ?? "movies-db";

	// Generate the INSERT statement for the D1 schema via Drizzle's `toSQL()`,
	// then inline the bound parameters into a single executable SQL string.
	const db = drizzle(new Database(":memory:"));
	const { sql, params } = db.insert(sqliteSchema.movies).values(rows).toSQL();

	let i = 0;
	const sqlWithValues = sql.replace(/\?/g, () =>
		sqlLit(params[i++] as string | number),
	);
	const statements = sqlWithValues
		.split(";")
		.map((s) => s.trim())
		.filter(Boolean);

	const result = spawnSync(
		"bun",
		[
			"x",
			"wrangler",
			"d1",
			"execute",
			dbName,
			"--remote",
			"--command",
			statements.join("; "),
		],
		{ cwd: resolve(import.meta.dir, ".."), stdio: "inherit" },
	);
	if (result.status !== 0) {
		console.error(
			`[db:seed] remote D1 seeding failed (exit ${result.status ?? 1}).`,
		);
		process.exit(result.status ?? 1);
	}
	console.log(`Seeding complete (d1 → remote D1 \`${dbName}\`).`);
}

const dialect = dbDialect();

switch (dialect) {
	case "sqlite": {
		// Local SQLite (sqlite, or d1 in --dev via .env.dev.d1 -> sqlite).
		const { db, close } = client as DbClient<SqliteDb>;
		try {
			await db.insert(schemas.movies as any).values(seedRows);
		} finally {
			await close();
		}
		console.log(`Seeding complete (sqlite → sqlite.db).`);
		break;
	}

	case "d1": {
		// d1 in prod (no --dev) seeds the REMOTE Cloudflare D1 database.
		if (!isDev) {
			seedRemoteD1(seedRows);
			break;
		}
		// d1 + --dev → local sqlite via .env.dev.d1 (sets DATABASE_TYPE=sqlite).
		const { db, close } = client as DbClient<SqliteDb>;
		try {
			await db.insert(schemas.movies as any).values(seedRows);
		} finally {
			await close();
		}
		console.log(`Seeding complete (d1 --dev → local sqlite).`);
		break;
	}

	case "turso": {
		ensureTursoToken();
		const { db, close } = client as DbClient<TursoDb>;
		try {
			await db.insert(schemas.movies as any).values(seedRows);
		} finally {
			await close();
		}
		const url = process.env["TURSO_URL"] ?? `file:///${process.cwd()}/tursodb.db`;
		console.log(`Seeding complete (turso → ${url}).`);
		break;
	}

	case "postgres":
	case "neon": {
		const { db, close } = client as DbClient<PostgresDb>;
		try {
			await db.insert(schemas.movies as any).values(seedRows);
		} finally {
			await close();
		}
		const url =
			process.env["DATABASE_URL"] ?? process.env["DATABASE_URL_UNPOOLED"];
		console.log(`Seeding complete (neon/postgres → ${url}).`);
		break;
	}
}
