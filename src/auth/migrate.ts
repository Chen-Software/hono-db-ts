/**
 * auth/migrate — idempotent bootstrap of the Better Auth tables (local only).
 *
 * The auth tables live in the SAME database as the domain data. On a fresh DB,
 * `ensureSchema` (src/http/schema.ts) applies every `drizzle/*.sql` file —
 * including the `*_auth_sqlite_create.sql` one — so auth tables appear for
 * free. But on an EXISTING database (created before this starter gained auth),
 * `ensureSchema` bails out ("database had no schema" is false) and the auth
 * tables would never be created.
 *
 * This helper runs ONLY the auth migration file, idempotently
 * (`CREATE TABLE IF NOT EXISTS`), at local server startup — after
 * `ensureSchema`. It is bun-only (node:fs); the Cloudflare paths get the same
 * tables from D1 migrations / the inlined migration SQL, so they never import
 * this module.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { SqlQueryExecutor } from "@/capacities/servable";

const MIGRATIONS_DIR = resolve(import.meta.dir, "../../drizzle");

/** Split SQL into individual statements (same as http/schema.ts). */
function splitStatements(sql: string): string[] {
	return sql
		.replace(/--.*$/gm, "")
		.split(";")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

/** The auth migration files (`*_auth_*.sql`) in the drizzle/ dir. */
function authMigrationFiles(): string[] {
	return readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.includes("_auth_") && f.endsWith(".sql"))
		.sort();
}

/**
 * Apply the Better Auth schema to an existing database. Safe to call on every
 * startup — all statements are `CREATE TABLE IF NOT EXISTS`.
 */
export async function ensureAuthSchema(
	client: SqlQueryExecutor,
): Promise<boolean> {
	const files = authMigrationFiles();
	if (files.length === 0) {
		console.warn(
			"auth: no auth migration file in drizzle/ — run `db:generate` or add a `*_auth_sqlite_create.sql`.",
		);
		return false;
	}
	let applied = 0;
	for (const file of files) {
		const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
		for (const stmt of splitStatements(sql)) {
			await client.unsafe(stmt);
			applied++;
		}
	}
	return applied > 0;
}
