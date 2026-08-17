import { describe, expect, it } from "bun:test";
import type { Table } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import typia from "typia";
import { RepositorySchemaModule } from "../models/repository";
import { UserSchemaModule } from "../models/user";
import { Triggerable, type CapacityComposer } from "./triggerable";
import type { SchemaModule } from "./schema-module";
import {
	type JsonSchema,
	SqlSerialisable,
	toDrizzleTable,
} from "./sql-serialisable";

/**
 * Minimal schema + base model, isolated per test (the capacity mutates the
 * prototype it is handed, so a fresh base each time keeps registrations clean).
 */
interface SqlFoo {
	id: string;
	name: string;
	n: number;
	active: boolean;
}

const makeSqlFooModel = () =>
	class SqlFooModel {
		constructor(data: SqlFoo) {
			Object.assign(this, data);
		}
	};

// The synthetic "Guarded" idiom: a capacity that registers only when `Triggerable`
// has paved the registry — used to prove the new capacity obeys that control.
function Guarded<TBase extends CapacityComposer>(Base: TBase) {
	Base.prototype.capacities && Base.prototype.addCapacity("Guarded");
	return class extends Base {};
}

// The fixed schema module — bound once, handed to the capacity. NOTE: `sql` /
// `sqlPg` are NOT bound here; `SqlSerialisable` DERIVES them from `schema`.
// We use `typia.json.schema` (JSON-Schema format) — `toDrizzleTable` parses that
// shape, and only the JSON-Schema output carries custom-tag metadata (e.g. the
// `Reference` tag's `x-reference`), so it is the right input for the SQL path.
const fooModule: SchemaModule<SqlFoo> = {
	schema: typia.json.schema<SqlFoo>(),
	classify: (d: any) => d,
	assertClassify: (d: any) => d,
	validateClassify: (d: any) => ({ success: true, data: d }),
	clone: typia.plain.createClone<SqlFoo>(),
	assertClone: typia.plain.createAssertClone<SqlFoo>(),
	isClone: typia.plain.createIsClone<SqlFoo>(),
	validateClone: typia.plain.createValidateClone<SqlFoo>(),
	is: typia.createIs<SqlFoo>(),
	assert: typia.createAssert<SqlFoo>(),
	assertGuard: typia.createAssertGuard<SqlFoo>(),
	validate: typia.createValidate<SqlFoo>(),
	assertEquals: typia.createAssertEquals<SqlFoo>(),
	validateEquals: typia.createValidateEquals<SqlFoo>(),
	assertGuardEquals: typia.createAssertGuardEquals<SqlFoo>(),
	assertGuardValidate: typia.createAssertGuard<SqlFoo>(),
	stringify: typia.json.createStringify<SqlFoo>(),
	toJSON: typia.json.createAssertStringify<SqlFoo>(),
	isStringify: typia.json.createIsStringify<SqlFoo>(),
	validateStringify: typia.json.createValidateStringify<SqlFoo>(),
	fromJSON: typia.json.createAssertParse<SqlFoo>(),
	isParse: typia.json.createIsParse<SqlFoo>(),
	validateParse: typia.json.createValidateParse<SqlFoo>(),
	message: typia.protobuf.message<SqlFoo>(),
	encode: typia.protobuf.createAssertEncode<SqlFoo>(),
	decode: typia.protobuf.createAssertDecode<SqlFoo>(),
	isEncode: typia.protobuf.createIsEncode<SqlFoo>(),
	validateEncode: typia.protobuf.createValidateEncode<SqlFoo>(),
	isDecode: typia.protobuf.createIsDecode<SqlFoo>(),
	validateDecode: typia.protobuf.createValidateDecode<SqlFoo>(),
	equals: typia.compare.createEquals<SqlFoo>(),
	less: typia.compare.createLess<SqlFoo>(),
	more: (x: any, y: any) => typia.compare.createLess<SqlFoo>()(y, x),
	random: typia.createRandom<SqlFoo>(),
};

// A fresh module per test so mutation never leaks across cases.
const freshModule = (): SchemaModule<SqlFoo> => ({ ...fooModule });

const compose = (mod?: SchemaModule<SqlFoo>) =>
	SqlSerialisable(Triggerable(makeSqlFooModel()), mod ?? freshModule(), {
		name: "foos",
	});

describe("SqlSerialisable registers itself (via Triggerable gatekeeper)", () => {
	it("adds 'SqlSerialisable' to the registry once Triggerable is present", () => {
		const caps = (
			compose() as unknown as { prototype: { capacities: Set<string> } }
		).prototype.capacities;
		expect(caps.has("Triggerable")).toBe(true);
		expect(caps.has("SqlSerialisable")).toBe(true);
	});

	it("without Triggerable, the capacity refuses to register (guarded)", () => {
		const C2 = Guarded(
			SqlSerialisable(makeSqlFooModel(), freshModule(), { name: "foos" }),
		);
		const caps = (
			C2 as unknown as {
				prototype: { capacities?: Set<string> };
			}
		).prototype.capacities;
		expect(caps).toBeUndefined();
	});
});

describe("SqlSerialisable requires a table name", () => {
	it("throws when `name` is omitted", () => {
		expect(() =>
			SqlSerialisable(Triggerable(makeSqlFooModel()), freshModule()),
		).toThrow(/`name`/);
	});
});

describe("SqlSerialisable derives mod.sql / mod.sqlPg from the reflected schema", () => {
	it("writes the primary-dialect projection into mod.sql", () => {
		const mod = freshModule();
		compose(mod);
		expect(mod.sql).toBeDefined();
		expect(mod.sql?.table).toBeDefined();
		expect(typeof mod.sql?.toRow).toBe("function");
		expect(typeof mod.sql?.fromRow).toBe("function");
	});

	it("writes the opposite-dialect projection into mod.sqlPg by default", () => {
		const mod = freshModule();
		compose(mod);
		expect(mod.sqlPg).toBeDefined();
	});

	it("skips mod.sqlPg when { both: false }", () => {
		const mod = freshModule();
		SqlSerialisable(Triggerable(makeSqlFooModel()), mod, {
			name: "foos",
			both: false,
		});
		expect(mod.sqlPg).toBeUndefined();
		expect(mod.sql).toBeDefined();
	});

	it("primary dialect 'pg' derives sql as postgres and sqlPg as sqlite", () => {
		const mod = freshModule();
		SqlSerialisable(Triggerable(makeSqlFooModel()), mod, {
			name: "foos",
			dialect: "pg",
		});
		// Both are still derived — just swapped.
		expect(mod.sql).toBeDefined();
		expect(mod.sqlPg).toBeDefined();
	});
});

describe("SqlSerialisable lifts the SQL surface onto the class", () => {
	it("static table exposes the derived primary-dialect drizzle table", () => {
		const mod = freshModule();
		const Ctor = compose(mod) as unknown as { table: Table };
		expect(Ctor.table).toBe(mod.sql?.table);
	});

	it("static toRow maps the entity to SQL column values", () => {
		const Ctor = compose() as unknown as {
			toRow: (e: SqlFoo) => Record<string, unknown>;
		};
		const row = Ctor.toRow({ id: "1", name: "x", n: 7, active: true });
		expect(row.name).toBe("x");
		expect(row.n).toBe(7);
		// boolean → 0/1 on the (sqlite) primary projection
		expect(row.active).toBe(1);
	});

	it("static toRow → fromRow round-trips the entity", () => {
		const Ctor = compose() as unknown as {
			toRow: (e: SqlFoo) => Record<string, unknown>;
			fromRow: (r: Record<string, unknown>) => SqlFoo;
		};
		const row = Ctor.toRow({ id: "1", name: "x", n: 7, active: true });
		expect(Ctor.fromRow(row)).toEqual({
			id: "1",
			name: "x",
			n: 7,
			active: true,
		});
	});

	it("instance toRow() maps a live entity to a row", () => {
		const Ctor = compose();
		const inst = new Ctor({
			id: "2",
			name: "y",
			n: 9,
			active: false,
		}) as unknown as {
			toRow: () => Record<string, unknown>;
		};
		expect(inst.toRow().name).toBe("y");
		expect(inst.toRow().active).toBe(0);
	});
});

describe("SqlSerialisable statics exist ONLY when the capacity is composed", () => {
	it("a plain model (no SqlSerialisable) has NO toRow / fromRow / table", () => {
		const Ctor = Triggerable(makeSqlFooModel()) as unknown as {
			table?: unknown;
			toRow?: unknown;
			fromRow?: unknown;
		};
		expect(Ctor.table).toBeUndefined();
		expect(Ctor.toRow).toBeUndefined();
		expect(Ctor.fromRow).toBeUndefined();
	});

	it("an instance of a plain model has NO toRow()", () => {
		const inst = new (Triggerable(makeSqlFooModel()))({
			id: "1",
			name: "x",
			n: 1,
			active: true,
		}) as unknown as {
			toRow?: unknown;
		};
		expect(inst.toRow).toBeUndefined();
	});
});

describe("toDrizzleTable is dialect-agnostic (sql-serialisable unit)", () => {
	it("derives a postgres table from the same schema", () => {
		const pg = toDrizzleTable(freshModule().schema as unknown as JsonSchema, {
			name: "foos",
			dialect: "pg",
		});
		expect(pg.table).toBeDefined();
		expect(typeof pg.toRow).toBe("function");
		expect(typeof pg.fromRow).toBe("function");
	});
});

describe("toDrizzleTable reads the Reference tag (sql-serialisable)", () => {
	it("derives a many-to-one FK relation from a Reference-tagged column", () => {
		const def = toDrizzleTable(
			RepositorySchemaModule.schema as unknown as JsonSchema,
			{
				name: "repositories",
				modelName: "Repository",
			},
		);
		expect(def.relations).toBeDefined();
		expect(def.relations).toHaveLength(1);
		const rel = def.relations![0];
		expect(rel.column).toBe("ownerId");
		expect(rel.target).toBe("UserSchema");
		expect(rel.targetColumn).toBe("id");
		expect(rel.cardinality).toBe("many-to-one");
		// Repository follows the User pattern: nullable owner, setNull on delete.
		expect(rel.onDelete).toBe("setNull");
	});

	it("wires a real drizzle .references() FK on the table (setNull)", () => {
		const tbl = RepositorySchemaModule.sql!.table as any;
		const fkSym = Object.getOwnPropertySymbols(tbl).find((s) =>
			String(s).toLowerCase().includes("foreignkey"),
		);
		expect(fkSym).toBeDefined();
		const fks = tbl[fkSym as symbol];
		expect(fks.length).toBe(1);
		expect(fks[0].onDelete).toBe("setNull");
	});

	it("registers both models so cross-table FKs resolve (no throw)", () => {
		expect(RepositorySchemaModule.sql).toBeDefined();
		expect(UserSchemaModule.sql).toBeDefined();
		const repoTbl = RepositorySchemaModule.sql!.table as any;
		const fkSym = Object.getOwnPropertySymbols(repoTbl).find((s) =>
			String(s).toLowerCase().includes("foreignkey"),
		);
		const fk = repoTbl[fkSym as symbol][0];
		expect(fk.reference).toBeDefined();
	});
});

describe("toDrizzleTable generates CHECK constraints (check option)", () => {
	interface Bounded {
		id: string;
		/** @minimum 1 @maximum 120 */
		age: number;
		/** @minLength 3 @maxLength 40 */
		slug: string;
		/** @pattern ^[a-z]+$ */
		code: string;
		status: "draft" | "live" | "archived";
	}

	const schema = typia.json.schema<Bounded>();

	it("emits CHECKs from reflected bounds (check defaults to true)", () => {
		const def = toDrizzleTable(schema as unknown as JsonSchema, {
			name: "bounded",
		});
		expect(def.checks).toBeDefined();
		const exprs = def.checks!.map((c) => c.expression);
		expect(exprs).toContain(`"age" >= 1`);
		expect(exprs).toContain(`"age" <= 120`);
		expect(exprs).toContain(`length("slug") >= 3`);
		expect(exprs).toContain(`length("slug") <= 40`);
		expect(exprs).toContain(`"status" IN ('archived', 'draft', 'live')`);
	});

	it("attaches the CHECKs to the drizzle table (visible via getTableConfig)", () => {
		const def = toDrizzleTable(schema as unknown as JsonSchema, {
			name: "bounded",
		});
		const cfg = getTableConfig(def.table as any);
		expect(cfg.checks.length).toBe(def.checks!.length);
	});

	it("skips CHECKs when check: false", () => {
		const def = toDrizzleTable(schema as unknown as JsonSchema, {
			name: "bounded",
			check: false,
		});
		expect(def.checks).toBeUndefined();
		const cfg = getTableConfig(def.table as any);
		expect(cfg.checks.length).toBe(0);
	});
});
