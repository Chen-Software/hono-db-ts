/**
 * dump-for-d1 — export the local dev database as INSERT SQL suitable for
 * Cloudflare D1 (`wrangler d1 execute --remote --file`).
 *
 *     bun run scripts/dump-for-d1.ts > /tmp/d1-seed.sql
 *     wrangler d1 execute codeforge --remote --file=/tmp/d1-seed.sql
 *
 * Reads `DATABASE_URL` (default `file:./dev.db`), writes `INSERT OR REPLACE`
 * statements for users / repositories (idempotent).
 */

import { SQL } from "bun";
import { databaseUrl } from "../src/macros/envs" with { type: "macro" };

const url = databaseUrl();
const client = new SQL(url);

const tables = ["users", "repositories"] as const;

function esc(v: unknown): string {
	if (v === null || v === undefined) return "NULL";
	if (typeof v === "number") return String(v);
	return "'" + String(v).replaceAll("'", "''") + "'";
}

for (const table of tables) {
	const colsRes = (await client.unsafe(
		`SELECT "name" FROM pragma_table_info('${table}') ORDER BY "cid"`,
	)) as Array<{ name: string }>;
	const cols = colsRes.map((c) => c.name);
	const rows = (await client.unsafe(`SELECT * FROM "${table}"`)) as Array<
		Record<string, unknown>
	>;
	console.log(`-- ${table}: ${rows.length} rows`);
	for (const row of rows) {
		const values = cols.map((c) => esc(row[c]));
		console.log(
			`INSERT OR REPLACE INTO "${table}" ("${cols.join('", "')}") VALUES (${values.join(", ")});`,
		);
	}
}
client.close();
