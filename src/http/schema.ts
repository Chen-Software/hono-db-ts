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

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { SQL } from "bun";

import type { SqlQueryExecutor } from "@/capacities/servable";

/**
 * Locate the `drizzle/` migration directory. It lives at the PROJECT ROOT
 * (`<root>/drizzle`), but `import.meta.dir`-relative resolution is fragile:
 *   - in SOURCE this file is `src/http/schema.ts` → `../../drizzle` is correct;
 *   - in the bundled SSR output (`dist/index.js`) `import.meta.dir` is `dist`,
 *     so `../../drizzle` escapes PAST the project root (→ `<parent>/drizzle`),
 *     which is exactly the `ENOENT: scandir …/drizzle` crash seen when the
 *     server boots from the bundle.
 * Resolve defensively: prefer `process.cwd()/drizzle` (the app is always run
 * from the project root), then fall back to the source/bundle-relative
 * candidates, and finally to `cwd/drizzle` so a missing dir still surfaces a
 * clear error rather than a wrong-path ENOENT.
 */
function resolveMigrationsDir(): string {
	const candidates = [
		resolve(process.cwd(), "drizzle"),
		resolve(import.meta.dir, "../../drizzle"),
		resolve(import.meta.dir, "../drizzle"),
	];
	for (const c of candidates) {
		if (existsSync(c)) return c;
	}
	return candidates[0]!;
}

const MIGRATIONS_DIR = resolveMigrationsDir();

/** The deliberate `DATABASE_URL` targets a service can run against. */
export type DatabaseTargetKind = "memory" | "file" | "d1" | "turso";

/** A resolved `DATABASE_URL`: which backend it targets + the normalised URL. */
export interface DatabaseTarget {
	kind: DatabaseTargetKind;
	/** Normalised URL to feed the backend client (`new SQL` / D1 binding name). */
	url: string;
}

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
	// Any sqlite-prefixed `:memory:` variant → the bare form Bun accepts.
	//   sqlite:///:memory:   sqlite:///memory:   sqlite://:memory:   sqlite::memory:
	if (/^sqlite:(?:\/\/)?\/?(:?memory:?)$/.test(trimmed)) {
		return ":memory:";
	}
	// File URLs (file:…, sqlite:///path.db, sqlite:./x.db) → pass through.
	return trimmed;
}

/**
 * Resolve a `DATABASE_URL` (optionally alongside `DATABASE_TYPE`) into a
 * deliberate target:
 *
 *   - `:memory:` / `sqlite::memory:` …          → `memory`
 *   - `file:./dev.db`, `sqlite:///abs.db`,      → `file`
 *     `./dev.db`, `/abs/dev.db`, `dev.db`
 *   - `d1:<name>` / `d1://<name>` / `d1:name`   → `d1`   (Cloudflare D1 remote)
 *   - `libsql://…` or `DATABASE_TYPE=turso`     → `turso`
 *
 * If `type` is given, an explicit `d1`/`turso` type overrides URL inference
 * (e.g. `DATABASE_URL=:memory:` with `DATABASE_TYPE=turso` is still in-memory,
 * but a bare name with `type=d1` is treated as a D1 database).
 */
export function resolveDatabaseTarget(
	url: string,
	type: string | undefined,
): DatabaseTarget {
	const trimmed = url.trim();

	// Memory — any of the sqlite :memory: spellings.
	if (
		/^sqlite:(?:\/\/)?\/?(:?memory:?)$/.test(trimmed) ||
		trimmed === ":memory:"
	) {
		return { kind: "memory", url: ":memory:" };
	}

	// Turso — explicit type, or the libsql:// protocol.
	if (type === "turso" || /^libsql:/.test(trimmed)) {
		return { kind: "turso", url: trimmed };
	}

	// D1 — explicit type, or the d1: scheme / a bare database name under type=d1.
	if (type === "d1" || /^d1:/.test(trimmed)) {
		const name = trimmed.replace(/^d1:(?:\/\/)?/, "") || "codeforge";
		return { kind: "d1", url: name };
	}

	// File — any path-ish value (relative, absolute, or a file: URL).
	return { kind: "file", url: trimmed };
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
export async function hasSchema(client: SqlQueryExecutor): Promise<boolean> {
	const rows = (await client.unsafe(
		`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
	)) as Array<{ name: string }>;
	return rows.length > 0;
}

/**
 * Apply the generated schema if the database is empty. Returns `true` when
 * schema was created, `false` when the DB already had tables (left untouched).
 */
export async function ensureSchema(client: SqlQueryExecutor): Promise<boolean> {
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
