/**
 * Generic table repositories, built automatically from the active dialect's
 * schema (`src/db/schema/index.ts`).
 *
 * `createRepos(db)` iterates the active schema's `schema` object (keyed by
 * table name) and builds a generic CRUD repo for **every** table — adding or
 * renaming a table in `./schema/sqlite.ts` / `./schema/postgres.ts` requires no
 * change here. Repos are exposed as `{ movies: …, directors: …, … }`.
 *
 * Two factory families are provided because the drivers differ:
 *   - SQLite family (local bun:sqlite, Turso/libSQL, Cloudflare D1): async
 *     `.all()` / `.run()` + `lastInsertRowid`. `await` on a sync result is
 *     harmless, so one impl serves all SQLite-family clients.
 *   - Postgres family (Postgres / Neon): async `SELECT`/`.returning()` with an
 *     identity primary key.
 *
 * NOTE: this module imports `schema/index.ts`, which uses a Bun macro → it is
 * **local / Bun only**. Cloudflare Worker entries build repos directly from the
 * specific schema variant instead (see `src/worker/<dialect>.ts`).
 */

import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { schemas } from "../db/schema";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { PgTable } from "drizzle-orm/pg-core";
import { dbDialect } from "@/macros/db-dialect";
import { createClient } from "../db/client";

const db = createClient();
const dialect = dbDialect();
const createRepo = dialect === "neon" || dialect === "postgres" ? createPgRepo : createSqliteRepo;

/** A table with an `id` column (all our tables follow this convention). */
type AnyTableWithId = { id: { name: string } } & Record<string, unknown>;

/** Generic row type (column -> value). */
type Row = Record<string, unknown>;

/**
 * A generic CRUD repository for a single table.
 * `create`/`update` accept a partial row object (column names as they appear on
 * the Drizzle table object, e.g. `releaseYear`).
 */
export interface TableRepo {
	list(): Promise<Row[]>;
	get(id: number): Promise<Row | null>;
	create(input: Row): Promise<Row | null>;
	update(id: number, updates: Row): Promise<Row | null>;
	remove(id: number): Promise<boolean>;
}

/** Map of table name -> generic repo. */
export type Repos = Record<string, TableRepo>;
export const repos = createRepos(db);

/** Build a generic repo over a SQLite-family database + table. */
function sqliteTableRepo<TTable extends AnyTableWithId>(
	db: SqliteRepoDb,
	table: TTable,
): TableRepo {
	const t = table as unknown as SQLiteTable;
	return {
		async list() {
			return db.select().from(t).all() as Row[];
		},
		async get(id) {
			const row = await db.select().from(t).where(eq(t.id, id)).get();
			return (row as Row | undefined) ?? null;
		},
		async create(input) {
			const result = (await db.insert(t).values(input).run()) as unknown as {
				lastInsertRowid: number | bigint;
			};
			const row = await db
				.select()
				.from(t)
				.where(eq(t.id, Number(result.lastInsertRowid)))
				.get();
			return (row as Row | undefined) ?? null;
		},
		async update(id, updates) {
			const existing = await db.select().from(t).where(eq(t.id, id)).get();
			if (!existing) return null;
			await db.update(t).set(updates).where(eq(t.id, id)).run();
			const row = await db.select().from(t).where(eq(t.id, id)).get();
			return (row as Row | undefined) ?? null;
		},
		async remove(id) {
			const existing = await db.select().from(t).where(eq(t.id, id)).get();
			if (!existing) return false;
			await db.delete(t).where(eq(t.id, id)).run();
			return true;
		},
	};
}

/** Build a generic repo over a Postgres database + table. */
function pgTableRepo<TTable extends AnyTableWithId>(
	db: PgRepoDb,
	table: TTable,
): TableRepo {
	const t = table as unknown as PgTable;
	return {
		async list() {
			return db.select().from(t) as Promise<Row[]>;
		},
		async get(id) {
			const [row] = await db.select().from(t).where(eq(t.id, id));
			return (row as Row | undefined) ?? null;
		},
		async create(input) {
			const [row] = await db.insert(t).values(input).returning();
			return (row as Row | undefined) ?? null;
		},
		async update(id, updates) {
			const [existing] = await db.select().from(t).where(eq(t.id, id));
			if (!existing) return null;
			const [row] = await db
				.update(t)
				.set(updates)
				.where(eq(t.id, id))
				.returning();
			return (row as Row | undefined) ?? null;
		},
		async remove(id) {
			const [existing] = await db.select().from(t).where(eq(t.id, id));
			if (!existing) return false;
			await db.delete(t).where(eq(t.id, id));
			return true;
		},
	};
}

/**
 * The minimal SQLite-family database shape a generic repo needs. `sync`
 * (`bun:sqlite`) and `async` (`@libsql/client`, `drizzle-orm/d1`) clients both
 * satisfy it — `await` on a sync result is harmless.
 */
type SqliteRepoDb = BaseSQLiteDatabase<
	"sync" | "async",
	unknown,
	Record<string, SQLiteTable>
>;

/** The minimal Postgres database shape a generic repo needs. */
type PgRepoDb = PgDatabase<PgQueryResultHKT, Record<string, PgTable>>;


/**
 * Build generic repos for **all** tables in the active dialect's schema, keyed
 * by table name. No table is hardcoded here — iterate `schemas.schema`.
 */
function createRepos(): Repos {
	const repos: Repos = {};
	const tables = schemas.schema as Record<string, AnyTableWithId>;

	for (const [name, table] of Object.entries(tables)) {
		// Both families expose the same generic repo shape; the driver-specific
		// build is selected by which type the db satisfies at the call site.
		repos[name] = createRepo(db, table);
	}
	return repos;
}

/** Build a SQLite-family repo for a single table (local / Worker entries). */
function createSqliteRepo<TTable extends AnyTableWithId>(
	db: SqliteRepoDb,
	table: TTable,
): TableRepo {
	return sqliteTableRepo(db, table);
}

/** Build a Postgres repo for a single table (local / Worker entries). */
function createPgRepo<TTable extends AnyTableWithId>(
	db: PgRepoDb,
	table: TTable,
): TableRepo {
	return pgTableRepo(db, table);
}
