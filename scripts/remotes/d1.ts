/**
 * Remote Cloudflare D1 seeding helper.
 *
 * Generates INSERT statements for the SQLite schema via Drizzle's `toSQL()`,
 * inlines the bound parameters, and executes them against the **remote** D1
 * database with `wrangler d1 execute --remote`. Used by `scripts/db-seed.ts`
 * when `DATABASE_TYPE=d1` and not running in `--dev` mode.
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { movies } from "../../src/db/schema/sqlite";

/** Escape a string literal for SQL (single quotes doubled). */
function sqlLit(value: string | number): string {
	return typeof value === "number" ? String(value) : `'${value.replace(/'/g, "''")}'`;
}

/**
 * Seed the remote Cloudflare D1 database via `wrangler d1 execute --remote`.
 * @param rows  seed rows conforming to the SQLite movies schema.
 */
export function seedRemoteD1(rows: { title: string; releaseYear: number }[]): void {
	const dbName = process.env["D1_DATABASE_NAME"] ?? "movies-db";

	// Generate the INSERT statement for the D1 schema via Drizzle's `toSQL()`,
	// then inline the bound parameters into a single executable SQL string.
	const db = drizzle(new Database(":memory:"));
	const { sql, params } = db.insert(movies).values(rows).toSQL();

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
		{ cwd: resolve(import.meta.dir, "..", ".."), stdio: "inherit" },
	);
	if (result.status !== 0) {
		console.error(`[db:seed] remote D1 seeding failed (exit ${result.status ?? 1}).`);
		process.exit(result.status ?? 1);
	}
	console.log(`Seeding complete (d1 → remote D1 \`${dbName}\`).`);
}
