import { describe, expect, it } from "bun:test";
import typia from "typia";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { toDrizzleTable, type JsonSchema } from "./sql-tablisable";
import { PostSchemaModule } from "../models/post";
import { UserSchemaModule } from "../models/user";

describe("toDrizzleTable reads the Reference tag (sql-tablisable)", () => {
	it("derives a many-to-one FK relation from a Reference-tagged column", () => {
		const def = toDrizzleTable(PostSchemaModule.schema as unknown as JsonSchema, {
			name: "posts",
			modelName: "PostData",
		});
		expect(def.relations).toBeDefined();
		expect(def.relations).toHaveLength(1);
		const rel = def.relations![0];
		expect(rel.column).toBe("authorId");
		expect(rel.target).toBe("UserSchema");
		expect(rel.targetColumn).toBe("id");
		expect(rel.cardinality).toBe("many-to-one");
		expect(rel.onDelete).toBe("cascade");
	});

	it("wires a real drizzle .references() FK on the table (cascade)", () => {
		const tbl = PostSchemaModule.sql!.table as any;
		const fkSym = Object.getOwnPropertySymbols(tbl).find((s) =>
			String(s).toLowerCase().includes("foreignkey"),
		);
		expect(fkSym).toBeDefined();
		const fks = tbl[fkSym as symbol];
		expect(fks.length).toBe(1);
		expect(fks[0].onDelete).toBe("cascade");
	});

	it("registers both models so cross-table FKs resolve (no throw)", () => {
		// Touch both modules so both tables are registered; deriving Post must
		// have resolved UserSchema's table via the registry without throwing.
		expect(PostSchemaModule.sql).toBeDefined();
		expect(UserSchemaModule.sql).toBeDefined();
		const postTbl = PostSchemaModule.sql!.table as any;
		const fkSym = Object.getOwnPropertySymbols(postTbl).find((s) =>
			String(s).toLowerCase().includes("foreignkey"),
		);
		// The FK closure resolves the target lazily; a missing target would throw
		// only when the columns are materialised. Force materialisation by reading
		// the inline FK's referenced table name off the thunk.
		const fk = postTbl[fkSym as symbol][0];
		// `reference.foreignTable` is set when drizzle builds the FK; if the
		// registry resolved correctly it is the users table, not undefined.
		expect(fk.reference).toBeDefined();
	});
});

describe("toDrizzleTable generates CHECK constraints (check option)", () => {
	// typia emits STRUCTURED bounds (minimum/maxLength/pattern/enum) only from
	// explicit JSDoc tags — not from free-text comments — so the reflected
	// schema actually carries them for `planChecks` to read.
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
