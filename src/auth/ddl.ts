/**
 * auth/ddl — render the Better Auth tables as plain SQLite `CREATE TABLE`
 * DDL, derived from `src/auth/schema.ts` (the ONE source of truth).
 *
 * `db:generate` (scripts/db-generate.ts) writes this into
 * `drizzle/<ts>_auth_sqlite_create.sql`, so the auth tables are created by the
 * SAME pipeline as the domain tables — `db:migrate`, `serve`'s `ensureSchema`,
 * the CF sqlite worker's inline migrations, and `wrangler d1 migrations
 * apply`. Keep `schema.ts` and the rendered DDL in sync automatically: column
 * names / types / nullability / uniqueness are introspected from the drizzle
 * table objects, so a column change in `schema.ts` is reflected here with no
 * hand-edited SQL to drift.
 *
 * Only the foreign keys are declared explicitly: drizzle keeps `.references()`
 * configuration private, and the auth schema has exactly two (session.userId
 * and account.userId → user.id, both `ON DELETE CASCADE`). Everything else is
 * introspected.
 */

import { authSchema } from "./schema";

/** drizzle's (stable) internal table metadata symbols. */
const TABLE_NAME = Symbol.for("drizzle:Name");
const TABLE_COLUMNS = Symbol.for("drizzle:Columns");

/** The column shape drizzle exposes on every table's `Columns` map. */
interface DrizzleColumn {
	name: string;
	primary: boolean;
	notNull: boolean;
	isUnique: boolean;
	getSQLType(): string;
}

interface DrizzleTable {
	[TABLE_NAME]: string;
	[TABLE_COLUMNS]: Record<string, DrizzleColumn>;
}

/**
 * FK actions declared in `schema.ts` via `.references(...)`. Kept explicit
 * here because drizzle stores the reference config internally; mirror the
 * table + column names exactly when you change `schema.ts`.
 */
const FOREIGN_KEYS: Record<
	string,
	Array<{ column: string; target: string; onDelete: "cascade" }>
> = {
	session: [{ column: "userId", target: "user", onDelete: "cascade" }],
	account: [{ column: "userId", target: "user", onDelete: "cascade" }],
	twoFactor: [{ column: "userId", target: "user", onDelete: "cascade" }],
};

/** Render one auth table as a `CREATE TABLE IF NOT EXISTS` statement. */
function renderTable(table: DrizzleTable): string {
	const name = table[TABLE_NAME];
	const defs = Object.values(table[TABLE_COLUMNS]).map((col) => {
		let d = `\t"${col.name}" ${col.getSQLType()}`;
		if (col.primary) d += " PRIMARY KEY";
		if (col.notNull) d += " NOT NULL";
		if (col.isUnique) d += " UNIQUE";
		return d;
	});
	for (const fk of FOREIGN_KEYS[name] ?? []) {
		defs.push(
			`\tCONSTRAINT "${name}_${fk.column}_fk" FOREIGN KEY ("${fk.column}") ` +
				`REFERENCES "${fk.target}" ("id") ON DELETE ${fk.onDelete.toUpperCase()}`,
		);
	}
	return `CREATE TABLE IF NOT EXISTS "${name}" (\n${defs.join(",\n")}\n);`;
}

/**
 * The full auth DDL — one idempotent statement per auth table, in
 * `authSchema` order (user, session, account, verification).
 */
export const authDdl: string = `${Object.values(
	authSchema as unknown as DrizzleTable[],
)
	.map(renderTable)
	.join("\n\n")}\n`;
