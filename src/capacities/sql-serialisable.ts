import type { CapacityConstructor } from "./capable";
import type { ComposeContext } from "./compose";
import type { SqlSchemaModule } from "./sql-tablisable";
import {
	toDrizzleTable,
	type SqlDialect,
	type SqlTablisableOptions,
} from "./sql-tablisable";

/**
 * Options for the {@link SqlSerialisable} capacity.
 *
 * `name` is required: the reflected schema has no reliable table name, so the
 * model must name its table (`"users"`, `"posts"`, …). `dialect` picks the
 * *primary* projection; the opposite dialect is derived alongside it.
 */
export interface SqlSerialisableOptions extends SqlTablisableOptions {
	/** Also derive the opposite dialect's table (`sqlPg` for sqlite primary). Default `true`. */
	both?: boolean;
}

/**
 * SqlSerialisable — a capacity that DERIVES the model's relational (Drizzle)
 * projection from its reflected typia schema (`mod.schema`), instead of the
 * model hand-writing a drizzle `Table`, AND lifts the SQL surface onto the
 * class.
 *
 * At compose time it:
 *   - derives `mod.sql`   — the primary-dialect table (overwriting any
 *     hand-bound one), and
 *   - derives `mod.sqlPg` — the opposite dialect's table (unless `both: false`),
 *     each a full {@link SqlSchemaDef} (table + row mappers);
 *   - LIFTS `static table` / `static toRow` / `static fromRow` and an instance
 *     `toRow()` onto the adorned CLASS (in place), so the class is
 *     **sql-tablisable** (`Class.table` is the drizzle table) and
 *     **sql-serialisable** (`Class.toRow` / `Class.fromRow` round-trip between
 *     the entity and a relational row).
 *
 * Because the statics are ADDED BY THIS MIXIN (never by the model), a class
 * that does NOT declare `SqlSerialisable` has NO `toRow` / `fromRow` / `table`
 * at all — the "only present when the capacity is enabled" guarantee falls out
 * of composition, exactly like `JsonSerialisable`'s `toJSON`/`fromJSON`.
 *
 * The `SqlBackend` and `UserRepo.overSql` then read the `sql` / `sqlPg`
 * slices — the model contains ZERO drizzle column code. This is the
 * "model → SQL" bridge the architecture calls for: the reflected schema is the
 * single source of truth, and both SQLite and Postgres tables fall out of it.
 *
 * Column strategy (draft):
 *   string | enum | date-time | object | array  → text (objects/arrays JSON-encoded)
 *   integer                                → integer
 *   number                                 → real / double precision
 *   boolean                                → integer (0/1) on sqlite, boolean on pg
 *   `id` property                          → primary key
 *   nullable / required                    → .nullable() / .notNull()
 *
 * Complex types (nested objects, arrays) degrade to a JSON text column — a
 * pragmatic default for a starter. A production model would normalise those
 * into real relations (e.g. `Post.author` → a join on `authorId`); the
 * `sql` slice is the seam to do that without touching the application layer.
 *
 * @example
 * const UserModel = defineModel<UserSchema>({
 *   schemaName: "UserSchema",
 *   schemaModule: UserSchemaModule,
 *   capacities: [
 *     JsonSerialisable,
 *     // `name` is REQUIRED; `dialect` picks the primary projection.
 *     { capacity: SqlSerialisable, options: { name: "users", dialect: "sqlite" } },
 *   ],
 * });
 * // After composition:
 * //   UserSchemaModule.sql / .sqlPg hold the derived SqlSchemaDefs (read by
 * //   SqlBackend / UserRepo.overSql), AND the class gained statics:
 * //   User.table, User.toRow(entity), User.fromRow(row), user.toRow().
 */
function SqlSerialisable<TBase extends CapacityConstructor>(
	Base: TBase,
	mod: SqlSchemaModule<any>,
	options?: SqlSerialisableOptions,
	_ctx?: ComposeContext,
): TBase {
	Base.prototype.capacities && Base.prototype.addCapacity("SqlSerialisable");

	const name = options?.name;
	if (!name) {
		throw new Error(
			"SqlSerialisable: a `name` (table name) is required — the reflected " +
				"schema has no reliable table name to derive one from.",
		);
	}
	const primary: SqlDialect = options?.dialect ?? "sqlite";
	const other: SqlDialect = primary === "sqlite" ? "pg" : "sqlite";

	// Derive the primary-dialect table (overwrites any hand-bound `sql`).
	const primaryDef = toDrizzleTable(mod.schema as any, {
		dialect: primary,
		name,
	});
	mod.sql = primaryDef;

	// Derive the opposite dialect too, so a multi-dialect deploy can pick per
	// environment without a second model binding.
	const secondaryDef =
		options?.both !== false
			? toDrizzleTable(mod.schema as any, { dialect: other, name })
			: undefined;
	if (secondaryDef) mod.sqlPg = secondaryDef;

	// ---- LIFT the SQL surface onto the class (in place, like
	//      ProtobufEncodable) — these statics only exist because this capacity
	//      is composed; a model without it has NO toRow / fromRow / table. ----
	(Base as any).table = primaryDef.table;
	(Base as any).toRow = primaryDef.toRow;
	(Base as any).fromRow = primaryDef.fromRow;
	(Base.prototype as any).toRow = function (this: any): Record<string, unknown> {
		return primaryDef.toRow(this);
	};

	return Base;
}

export { SqlSerialisable };
