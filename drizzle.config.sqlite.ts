import { defineConfig } from "drizzle-kit";

/**
 * Resolve a SQLite connection URL. Prefer `TURSO_URL` / `DATABASE_URL` only when
 * it's actually a SQLite/libSQL URL (`file:` or `libsql:`); otherwise fall back
 * to the local `sqlite.db` (the shared `DATABASE_URL` may point at a
 * Postgres/Neon server for another dialect).
 */
function sqliteUrl(): string {
	const url =
		process.env["TURSO_URL"] ??
		process.env["TURSO_DB_URL"] ??
		process.env["DATABASE_URL"];
	if (url && (url.startsWith("file:") || url.startsWith("libsql:"))) return url;
	return "sqlite.db";
}

export default defineConfig({
	dialect: "sqlite",
	schema: "./src/db/schema/sqlite.ts",
	out: "./drizzle/sqlite",
	dbCredentials: {
		url: sqliteUrl(),
	},
});
