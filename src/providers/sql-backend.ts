import {
	and,
	eq,
	gt,
	gte,
	inArray,
	isNotNull,
	isNull,
	like,
	lt,
	lte,
	ne,
	type Table,
} from "drizzle-orm";
import type { SqlSchemaDef } from "../capacities/schema-module";
import type { EntityFilter, FieldQuery, StoreBackend } from "./store-backend";

/**
 * `DrizzleRunner` — the minimal structural shape a drizzle database satisfies,
 * e.g. a `BunSQLiteDatabase` (local `bun:sqlite`). We type it structurally
 * (rather than importing the concrete db type) so `SqlBackend` is
 * driver-agnostic: any driver with `select` / `insert` / `update` / `delete`
 * that returns the expected query builders works — `bun:sqlite` locally, a
 * remote Postgres driver in production. Only the driver passed to the
 * constructor differs.
 */
export interface DrizzleRunner {
	select: () => any;
	insert: (table: Table) => any;
	update: (table: Table) => any;
	delete: (table: Table) => any;
}

/**
 * `SqlBackend<E, T>` — the SQL-shaped `StoreBackend` adapter.
 *
 * Unlike `BlobBackend`, this maps each entity field to a real table COLUMN. It
 * uses drizzle-orm so the SAME typed query builder compiles to either SQLite or
 * Postgres dialect depending on the driver. `find` compiles the logical
 * `EntityFilter` into real SQL WHERE clauses (equality + operators), giving
 * genuine column-level predicates and server-side filtering — the capability
 * the document-in-DB `DbProvider` deliberately gave up.
 *
 * The model supplies the table + row mappers via `SchemaModule.sql`, so this
 * adapter is generic and knows nothing about `User`. The `raw()` escape hatch
 * returns `{ db, table }` for callers that need raw SQL (joins, column maths)
 * the logical API cannot express.
 */
export class SqlBackend<E, T extends Table> implements StoreBackend<E> {
	readonly kind = "sql" as const;

	constructor(
		private db: DrizzleRunner,
		private def: SqlSchemaDef<E, T>,
	) {}

	async insert(_ns: string, e: E): Promise<void> {
		await this.db.insert(this.def.table).values(this.def.toRow(e) as any);
	}

	async get(_ns: string, id: string): Promise<E | null> {
		const cols = this.def.table as Record<string, any>;
		const rows = await this.db
			.select()
			.from(this.def.table)
			.where(eq(cols.id, id))
			.limit(1);
		return rows[0] ? this.def.fromRow(rows[0] as Record<string, unknown>) : null;
	}

	async update(_ns: string, id: string, patch: Partial<E>): Promise<void> {
		const cols = this.def.table as Record<string, any>;
		const row = this.def.toRow(patch as E);
		await this.db.update(this.def.table).set(row as any).where(eq(cols.id, id));
	}

	async delete(_ns: string, id: string): Promise<void> {
		const cols = this.def.table as Record<string, any>;
		await this.db.delete(this.def.table).where(eq(cols.id, id));
	}

	async find(_ns: string, filter: EntityFilter<E> = {}): Promise<E[]> {
		const cols = this.def.table as Record<string, any>;
		const where = this.compile(cols, filter);
		const q = this.db.select().from(this.def.table);
		const rows = where ? await q.where(where) : await q;
		let out = (rows as Record<string, unknown>[]).map((r) =>
			this.def.fromRow(r),
		);
		if (filter.limit != null) out = out.slice(0, filter.limit);
		return out;
	}

	raw(): { db: DrizzleRunner; table: T } {
		return { db: this.db, table: this.def.table };
	}

	private compile(cols: Record<string, any>, filter: EntityFilter<E>): any {
		const exprs: any[] = [];
		if (filter.where) {
			for (const [k, v] of Object.entries(filter.where)) {
				exprs.push(eq(cols[k], v));
			}
		}
		if (filter.query) {
			for (const [k, q] of Object.entries(filter.query)) {
				exprs.push(this.opExpr(cols[k], q as FieldQuery));
			}
		}
		return exprs.length ? and(...exprs) : undefined;
	}

	private opExpr(col: any, q: FieldQuery): any {
		switch (q.op) {
			case "eq":
				return eq(col, q.value);
			case "ne":
				return ne(col, q.value);
			case "like":
				return like(col, q.value as string);
			case "gt":
				return gt(col, q.value);
			case "gte":
				return gte(col, q.value);
			case "lt":
				return lt(col, q.value);
			case "lte":
				return lte(col, q.value);
			case "in":
				return inArray(col, q.value as unknown[]);
			case "null":
				return isNull(col);
			case "notNull":
				return isNotNull(col);
		}
	}
}
