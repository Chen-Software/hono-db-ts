/**
 * db-migrate — apply the generated migration SQL to the database.
 *
 * Reads the migration files produced by `scripts/db-generate.ts` from the
 * `drizzle/` directory and applies them (in filename order — timestamps are
 * ascending) to the database selected by the `databaseUrl()` build macro via
 * the `drizzle-orm/bun-sql` driver, exactly as the `query` command does:
 *
 *     import { SQL } from "bun";
 *     import { drizzle } from "drizzle-orm/bun-sql";
 *     import { databaseUrl } from "@/macros/envs" with { type: "macro" };
 *     const client = new SQL(databaseUrl());
 *     const db = drizzle({ client });
 *
 * (Note: the re-export barrel `@/macros` cannot be consumed with
 * `with { type: "macro" }` — Bun throws `MacroLoadError` — so we import the
 * `envs` macro module directly, and it does not re-export `databaseUrl`.)
 *
 * Each migration file is split on `;` into statements, and each statement is
 * executed sequentially through the drizzle handle (`db.execute(...)`). This
 * keeps migrations plain SQL (no drizzle-kit journal format) while still
 * flowing through the same drizzle database the app queries with.
 *
 * Run directly (`bun run scripts/db-migrate.ts`) or via the CLI
 * (`bun run src/main.ts db:migrate`). The CLI runs `models:build` first so the
 * migrations are always regenerated from the latest models before applying.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Database } from "bun:sqlite";
import { databaseUrl } from "../src/macros/envs" with { type: "macro" };

const MIGRATIONS_DIR = resolve(import.meta.dir, "../drizzle");

/** Split a migration file's SQL into individual statements. */
function splitStatements(sql: string): string[] {
	return sql
		.replace(/--.*$/gm, "") // strip line comments
		.split(";")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

export async function runMigrations(): Promise<string[]> {
	const url = databaseUrl();
	if (!url) {
		throw new Error(
			"db:migrate: no DATABASE_URL (and no TURSO_URL). Set it in .env or the shell.",
		);
	}

	const files = readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.endsWith(".sql"))
		.sort(); // ascending — timestamped migrations apply in order

	if (files.length === 0) {
		console.log("No migration files found in drizzle/. Run `db:generate` first.");
		return [];
	}

	// dev.db is a local SQLite file (prod D1 is applied via `wrangler d1 migrations apply`,
	// not this runner). drizzle-orm's `execute` swallows the underlying error on DDL, so we
	// apply statements through `bun:sqlite`'s `Database.exec`, which is reliable.
	const client = new Database(url.startsWith("file:") ? url.slice(5) : url);
	const applied: string[] = [];

	for (const file of files) {
		const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
		const statements = splitStatements(sql);
		console.log(`Applying ${file} (${statements.length} statement(s)) …`);
		for (const stmt of statements) {
			client.exec(stmt);
		}
		applied.push(file);
	}

	console.log(`\nApplied ${applied.length} migration(s):`);
	for (const f of applied) console.log(`  ${f}`);
	return applied;
}

async function main(): Promise<void> {
	try {
		await runMigrations();
	} catch (err) {
		console.error(`db:migrate failed: ${(err as Error).message}`);
		process.exit(1);
	}
}

if (import.meta.main) {
	main();
}
