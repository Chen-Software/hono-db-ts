/**
 * Generic table repositories, built from any dialect's schema.
 *
 * `createRepos(db, schema)` iterates a schema object (keyed by table name, e.g.
 * `schemas.schema` from `src/db/schema/index.ts`) and builds a generic CRUD repo
 * for **every** table — adding or renaming a table in `./schema/sqlite.ts` /
 * `./schema/postgres.ts` requires no change here. Repos are exposed as
 * `{ movies: …, directors: …, … }`.
 *
 * Two factory families are provided because the drivers differ, selected by the
 * build-time `isPg()` macro:
 *   - SQLite family (local bun:sqlite, Turso/libSQL, Cloudflare D1): async
 *     `.all()` / `.run()` + `lastInsertRowid`. `await` on a sync result is
 *     harmless, so one impl serves all SQLite-family clients.
 *   - Postgres family (Postgres / Neon): async `SELECT`/`.returning()` with an
 *     identity primary key.
 *
 * The client is passed in (never built here) so the same factory works for the
 * local Bun runtime (`createClient()` from `src/db/client.ts`) and the Cloudflare
 * Worker entries, which build their client from bindings directly (see
 * `src/worker/<dialect>.ts`).
 */

import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { PgTable } from "drizzle-orm/pg-core";
import { isPg } from "../macros/db" with { type: "macro" };
import { client } from "@/db";
import { schemas } from "@/db/schema";

/** A table with an `id` column (all our tables follow this convention). */
type AnyTableWithId = { id: { name: string } } & Record<string, unknown>;

/** Generic row type (column -> value). */
export type Row = Record<string, unknown>;

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

/** The minimal SQLite-family database shape a generic repo needs. */
export type SqliteRepoDb = BaseSQLiteDatabase<
	"sync" | "async",
	unknown,
	Record<string, SQLiteTable>
>;

/** The minimal Postgres database shape a generic repo needs. */
export type PgRepoDb = PgDatabase<PgQueryResultHKT, Record<string, PgTable>>;

/** The generic `id` column of a table, for `eq` filters. */
type IdColumn = { name: string };

/** Build a generic repo over a SQLite-family database + table. */
function sqliteTableRepo(db: SqliteRepoDb, table: AnyTableWithId): TableRepo {
	const t = table as unknown as SQLiteTable;
	const idColumn = table.id as IdColumn;
	return {
		async list() {
			return db.select().from(t).all() as Row[];
		},
		async get(id) {
			const row = await db
				.select()
				.from(t)
				.where(eq(idColumn as never, id))
				.get();
			return (row as Row | undefined) ?? null;
		},
		async create(input) {
			const result = (await db.insert(t).values(input).run()) as unknown as {
				lastInsertRowid: number | bigint;
			};
			const row = await db
				.select()
				.from(t)
				.where(eq(idColumn as never, Number(result.lastInsertRowid)))
				.get();
			return (row as Row | undefined) ?? null;
		},
		async update(id, updates) {
			const existing = await db
				.select()
				.from(t)
				.where(eq(idColumn as never, id))
				.get();
			if (!existing) return null;
			await db
				.update(t)
				.set(updates as Record<string, unknown>)
				.where(eq(idColumn as never, id))
				.run();
			const row = await db
				.select()
				.from(t)
				.where(eq(idColumn as never, id))
				.get();
			return (row as Row | undefined) ?? null;
		},
		async remove(id) {
			const existing = await db
				.select()
				.from(t)
				.where(eq(idColumn as never, id))
				.get();
			if (!existing) return false;
			await db
				.delete(t)
				.where(eq(idColumn as never, id))
				.run();
			return true;
		},
	};
}

/** Build a generic repo over a Postgres database + table. */
function pgTableRepo(db: PgRepoDb, table: AnyTableWithId): TableRepo {
	const t = table as unknown as PgTable;
	const idColumn = table.id as IdColumn;
	return {
		async list() {
			return db.select().from(t) as Promise<Row[]>;
		},
		async get(id) {
			const [row] = await db
				.select()
				.from(t)
				.where(eq(idColumn as never, id));
			return (row as Row | undefined) ?? null;
		},
		async create(input) {
			const [row] = await db.insert(t).values(input).returning();
			return (row as Row | undefined) ?? null;
		},
		async update(id, updates) {
			const [existing] = await db
				.select()
				.from(t)
				.where(eq(idColumn as never, id));
			if (!existing) return null;
			const [row] = await db
				.update(t)
				.set(updates as Record<string, unknown>)
				.where(eq(idColumn as never, id))
				.returning();
			return (row as Row | undefined) ?? null;
		},
		async remove(id) {
			const [existing] = await db
				.select()
				.from(t)
				.where(eq(idColumn as never, id));
			if (!existing) return false;
			await db.delete(t).where(eq(idColumn as never, id));
			return true;
		},
	};
}

/**
 * Build generic repos for **every** table in `schema`, keyed by table name.
 * No table is hardcoded here — iterate `schema` (e.g. `schemas.schema`).
 * The repo family (SQLite vs Postgres) is chosen by the build-time `isPg()`
 * macro, so the active dialect is a compile-time constant.
 *
 * @param db   A SQLite-family or Postgres Drizzle client.
 * @param schema The dialect schema object (table name -> table definition).
 */
export function createRepos(
	db: any,
	schema: Record<string, unknown>,
): Repos {
	const repos: Repos = {};
	for (const [name, table] of Object.entries(schema)) {
		repos[name] = isPg()
			? pgTableRepo(db, table as AnyTableWithId)
			: sqliteTableRepo(db, table as AnyTableWithId);
	}
	return repos;
}

export const repos = createRepos(client.db, schemas.schema);
