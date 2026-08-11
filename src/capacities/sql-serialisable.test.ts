import { describe, expect, it } from "bun:test";
import type { Table } from "drizzle-orm";
import typia from "typia";
import { Capable, type CapacityConstructor } from "./capable";
import type { SchemaModule } from "./schema-module";
import { SqlSerialisable } from "./sql-serialisable";
import { toDrizzleTable, type JsonSchema } from "./sql-tablisable";

/**
 * Minimal schema + base model, isolated per test (the capacity mutates the
 * prototype it is handed, so a fresh base each time keeps registrations clean).
 */
interface Foo {
	id: string;
	name: string;
	n: number;
	active: boolean;
}

const makeFooModel = () =>
	class FooModel {
		constructor(data: Foo) {
			Object.assign(this, data);
		}
	};

// The synthetic "Guarded" idiom: a capacity that registers only when `Capable`
// has paved the registry — used to prove the new capacity obeys that control.
function Guarded<TBase extends CapacityConstructor>(Base: TBase) {
	Base.prototype.capacities && Base.prototype.addCapacity("Guarded");
	return class extends Base {};
}

// The fixed schema module — bound once, handed to the capacity. NOTE: `sql` /
// `sqlPg` are NOT bound here; `SqlSerialisable` DERIVES them from `schema`.
// We use `typia.json.schema` (JSON-Schema format) — `toDrizzleTable` parses that
// shape, and only the JSON-Schema output carries custom-tag metadata (e.g. the
// `Reference` tag's `x-reference`), so it is the right input for the SQL path.
const fooModule: SchemaModule<Foo> = {
	schema: typia.json.schema<Foo>(),
	classify: (d: any) => d,
	assertClassify: (d: any) => d,
	validateClassify: (d: any) => ({ success: true, data: d }),
	clone: typia.plain.createClone<Foo>(),
	assertClone: typia.plain.createAssertClone<Foo>(),
	isClone: typia.plain.createIsClone<Foo>(),
	validateClone: typia.plain.createValidateClone<Foo>(),
	is: typia.createIs<Foo>(),
	assert: typia.createAssert<Foo>(),
	assertGuard: typia.createAssertGuard<Foo>(),
	validate: typia.createValidate<Foo>(),
	"assert-equals": typia.createAssertEquals<Foo>(),
	"validate-equals": typia.createValidateEquals<Foo>(),
	"assert-guard-equals": typia.createAssertGuardEquals<Foo>(),
	"assert-guard-validate": typia.createAssertGuard<Foo>(),
	stringify: typia.json.createStringify<Foo>(),
	toJSON: typia.json.createAssertStringify<Foo>(),
	isStringify: typia.json.createIsStringify<Foo>(),
	validateStringify: typia.json.createValidateStringify<Foo>(),
	fromJSON: typia.json.createAssertParse<Foo>(),
	isParse: typia.json.createIsParse<Foo>(),
	validateParse: typia.json.createValidateParse<Foo>(),
	message: typia.protobuf.message<Foo>(),
	encode: typia.protobuf.createAssertEncode<Foo>(),
	decode: typia.protobuf.createAssertDecode<Foo>(),
	isEncode: typia.protobuf.createIsEncode<Foo>(),
	validateEncode: typia.protobuf.createValidateEncode<Foo>(),
	isDecode: typia.protobuf.createIsDecode<Foo>(),
	validateDecode: typia.protobuf.createValidateDecode<Foo>(),
	equals: typia.compare.createEquals<Foo>(),
	less: typia.compare.createLess<Foo>(),
	more: (x: any, y: any) => typia.compare.createLess<Foo>()(y, x),
	random: typia.createRandom<Foo>(),
};

// A fresh module per test so mutation never leaks across cases.
const freshModule = (): SchemaModule<Foo> => ({ ...fooModule });

const compose = (mod?: SchemaModule<Foo>) =>
	SqlSerialisable(Capable(makeFooModel()), mod ?? freshModule(), {
		name: "foos",
	});

describe("SqlSerialisable registers itself (via Capable gatekeeper)", () => {
	it("adds 'SqlSerialisable' to the registry once Capable is present", () => {
		const caps = (
			compose() as unknown as { prototype: { capacities: Set<string> } }
		).prototype.capacities;
		expect(caps.has("Capable")).toBe(true);
		expect(caps.has("SqlSerialisable")).toBe(true);
	});

	it("without Capable, the capacity refuses to register (guarded)", () => {
		const C2 = Guarded(
			SqlSerialisable(makeFooModel(), freshModule(), { name: "foos" }),
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
			SqlSerialisable(Capable(makeFooModel()), freshModule()),
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
		SqlSerialisable(Capable(makeFooModel()), mod, {
			name: "foos",
			both: false,
		});
		expect(mod.sqlPg).toBeUndefined();
		expect(mod.sql).toBeDefined();
	});

	it("primary dialect 'pg' derives sql as postgres and sqlPg as sqlite", () => {
		const mod = freshModule();
		SqlSerialisable(Capable(makeFooModel()), mod, {
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
			toRow: (e: Foo) => Record<string, unknown>;
		};
		const row = Ctor.toRow({ id: "1", name: "x", n: 7, active: true });
		expect(row.name).toBe("x");
		expect(row.n).toBe(7);
		// boolean → 0/1 on the (sqlite) primary projection
		expect(row.active).toBe(1);
	});

	it("static toRow → fromRow round-trips the entity", () => {
		const Ctor = compose() as unknown as {
			toRow: (e: Foo) => Record<string, unknown>;
			fromRow: (r: Record<string, unknown>) => Foo;
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
		const Ctor = Capable(makeFooModel()) as unknown as {
			table?: unknown;
			toRow?: unknown;
			fromRow?: unknown;
		};
		expect(Ctor.table).toBeUndefined();
		expect(Ctor.toRow).toBeUndefined();
		expect(Ctor.fromRow).toBeUndefined();
	});

	it("an instance of a plain model has NO toRow()", () => {
		const inst = new (Capable(makeFooModel()))({
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

describe("toDrizzleTable is dialect-agnostic (sql-tablisable unit)", () => {
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
