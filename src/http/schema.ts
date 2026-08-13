/**
 * http/schema — schema bootstrap for the query app.
 *
 * Shared by the local dev server (`scripts/serve.ts`) so `bun start serve`
 * works with ZERO setup: when the target database has no tables yet (a fresh
 * `:memory:` DB or an empty file DB), the generated migration SQL from
 * `drizzle/*.sql` is applied at startup — the exact same SQL `db:migrate`
 * applies.
 *
 * If the database already has tables (e.g. you ran `db:migrate`/`db:seed`
 * against a file DB), nothing is touched — existing data is preserved.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { SQL } from "bun";

import type { SqlQueryExecutor } from "@/capacities/servable";

const MIGRATIONS_DIR = resolve(import.meta.dir, "../../drizzle");

/**
 * Normalise a `DATABASE_URL` for Bun's `new SQL()`.
 *
 * Bun's SQL adapter rejects the canonical `sqlite:///:memory:` (three slashes)
 * with `SQLITE_CANTOPEN`; it accepts `:memory:` directly. File URLs are passed
 * through unchanged. Guard against the common misspellings so the same env file
 * works for every tool in the repo.
 */
export function normalizeDatabaseUrl(url: string): string {
	const trimmed = url.trim();
	// sqlite:///:memory:  → :memory:
	// sqlite:///memory:   → :memory:   (the `/:` form)
	if (/^sqlite:(?:\/\/)?\/:?memory:$/.test(trimmed)) {
		return ":memory:";
	}
	// sqlite:///absolute/path.db  → keep as-is (Bun accepts sqlite: paths)
	return trimmed;
}

/** Split a migration file's SQL into individual statements. */
export function splitStatements(sql: string): string[] {
	return sql
		.replace(/--.*$/gm, "") // strip line comments
		.split(";")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

/** Read the generated migration SQL files, concatenated (ascending order). */
export function readMigrationsSql(): string {
	const files = readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.endsWith(".sql"))
		.sort();
	return files
		.map((f) => `-- ${f}\n${readFileSync(resolve(MIGRATIONS_DIR, f), "utf8")}`)
		.join("\n");
}

/** Does the database have any application tables yet? */
export async function hasSchema(
	client: SqlQueryExecutor,
): Promise<boolean> {
	const rows = (await client.unsafe(
		`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
	)) as Array<{ name: string }>;
	return rows.length > 0;
}

/**
 * Apply the generated schema if the database is empty. Returns `true` when
 * schema was created, `false` when the DB already had tables (left untouched).
 */
export async function ensureSchema(
	client: SqlQueryExecutor,
): Promise<boolean> {
	if (await hasSchema(client)) return false;
	const sql = readMigrationsSql();
	if (!sql.trim()) {
		console.warn(
			"serve: no migration files in drizzle/ — run `bun run src/main.ts db:generate sqlite` first.",
		);
		return false;
	}
	const statements = splitStatements(sql);
	for (const stmt of statements) {
		await client.unsafe(stmt);
	}
	return true;
}
