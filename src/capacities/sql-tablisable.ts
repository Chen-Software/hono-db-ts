import {
	sqliteTable,
	text as sText,
	integer as sInt,
	real as sReal,
} from "drizzle-orm/sqlite-core";
import {
	pgTable,
	text as pText,
	integer as pInt,
	doublePrecision as pDouble,
	boolean as pBool,
} from "drizzle-orm/pg-core";
import type { SchemaModule } from "./schema-module";
import type { Table } from "drizzle-orm";
import type { RelationCardinality, OnDelete } from "../tags/reference";

/**
 * `ReferenceMeta` — the decoded shape of a `Reference` tag (`x-reference`
 * extension in the reflected JSON schema). Mirrors the tag declared in
 * `src/tags/reference.ts`.
 */
export interface ReferenceMeta {
	/** Target model name, e.g. `"UserSchema"`. */
	target: string;
	/** Referenced column on the target table. Default `"id"`. */
	column?: string;
	/** Relation cardinality. Default `"many-to-one"`. */
	cardinality?: RelationCardinality;
	/** Referential action on delete. Default `"noAction"`. */
	onDelete?: OnDelete;
}

/**
 * Module-level registry of derived Drizzle tables, keyed by model name (optionally
 * suffixed with `:pg` for the Postgres projection). Populated by
 * {@link toDrizzleTable} so that a `references()` clause on one table can resolve
 * another model's table lazily — circular-import safe and dialect-aware.
 */
const tableRegistry = new Map<string, () => Table>();

function regKey(modelName: string, dialect: SqlDialect): string {
	return dialect === "pg" ? `${modelName}:pg` : modelName;
}

/** Register a derived table so other tables can reference it. */
export function registerTable(
	modelName: string,
	dialect: SqlDialect,
	thunk: () => Table,
): void {
	tableRegistry.set(regKey(modelName, dialect), thunk);
}

/** Resolve a registered table (throws if the target was never derived). */
export function resolveTableThunk(modelName: string, dialect: SqlDialect): () => Table {
	const thunk = tableRegistry.get(regKey(modelName, dialect));
	if (!thunk) {
		throw new Error(
			`sql-tablisable: table "${modelName}" (${dialect}) was referenced via a ` +
				`Reference tag but never derived. Make sure the target model composes ` +
				`SqlSerialisable so toDrizzleTable runs for it first.`,
		);
	}
	return thunk;
}

/** Read the `Reference` tag off a reflected JSON-schema property, if present. */
function referenceOf(prop: JsonProp): ReferenceMeta | undefined {
	const meta = (prop as Record<string, unknown>)["x-reference"];
	if (!meta || typeof meta !== "object") return undefined;
	return meta as ReferenceMeta;
}

/**
 * `sql-tablisable` — the model → Drizzle bridge.
 *
 * typia's reflected JSON schema (`typia.json.schema<T>()`, surfaced on the
 * model as `mod.schema`) is a JSON Schema object whose properties carry our
 * custom `Reference` tag as an `x-reference` extension. This module turns THAT
 * into a real Drizzle {@link SqlSchemaDef} — a `Table` plus `toRow` / `fromRow`
 * mappers — for either dialect, AND derives foreign-key columns + `.references()`
 * constraints from any `x-reference` metadata it finds. The model never writes a
 * drizzle `Table` by hand; the reflected schema (with `Reference` tags) is the
 * single source of truth and both the SQLite and Postgres projections fall out
 * of it.
 *
 * Cross-model targets are resolved through a module-level {@link tableRegistry}.
 * Why a registry (and not `typia.reflect.schemas<A,B>()`): the current toolchain
 * only transforms the single-argument typia entry points (`typia.json.schema<T>`,
 * `typia.reflect.schema<T>`), not the multi-type `schemas<A,B>` collection. The
 * registry reproduces what `schemas` would give us — a shared pool so a `Post`
 * table can reference a `User` table — by registering each derived table under
 * its model name and letting `.references()` look the target up lazily (a thunk),
 * which is also circular-import safe.
 *
 * It is deliberately typia-FREE at runtime: `mod.schema` is already a plain
 * JSON object (typia inlined it at build time), so {@link toDrizzleTable} runs
 * under plain `bun` with no transformer — handy for unit-testing the mapping.
 */

/** The slice of typia's `IJsonSchema` we actually read. */
export interface JsonProp {
	type?: string | string[];
	format?: string;
	nullable?: boolean;
	enum?: readonly unknown[];
	items?: JsonSchema;
	properties?: Record<string, JsonProp>;
	required?: string[];
	// numeric / string bounds (recorded for documentation; ignored for columns)
	minimum?: number;
	maximum?: number;
	exclusiveMinimum?: number | boolean;
	// typia may emit extra metadata we don't consume
	[x: string]: unknown;
}

/** typia's reflected JSON schema (loosely typed — we read a known subset). */
export interface JsonSchema {
	type?: string | string[];
	format?: string;
	nullable?: boolean;
	properties?: Record<string, JsonProp>;
	required?: string[];
	items?: JsonSchema;
	[x: string]: unknown;
}

export type SqlDialect = "sqlite" | "pg";

export interface SqlTablisableOptions {
	/** Table name. Required — the reflected schema has no reliable table name. */
	name: string;
	/** Dialect to build columns for. Default `"sqlite"`. */
	dialect?: SqlDialect;
	/**
	 * Model name (`schemaName`) used to register the derived table in the
	 * {@link tableRegistry} so other tables' `Reference` tags can resolve it.
	 * Usually the `schemaName` from the model's `defineModel` call. If omitted,
	 * the table is still built but not registered for cross-references.
	 */
	modelName?: string;
}

/**
 * `SqlRelationDef` — one foreign-key relation on a model's SQL table, derived
 * from a `Reference` tag on a property.
 *
 * `column` is the FK column ON THIS table (e.g. `"authorId"`); `target` is the
 * referenced model name (resolved through {@link resolveTableThunk} so two
 * models can reference each other without a circular-import failure at module
 * load — mirroring `Referencible`'s `target: () => Class`). `cardinality` /
 * `onDelete` mirror the `Referencible` vocabulary so the in-memory relation and
 * the SQL constraint stay consistent.
 */
export interface SqlRelationDef {
	/** FK column ON THIS table, e.g. `"authorId"`. */
	column: string;
	/** Referenced model name, e.g. `"UserSchema"`. */
	target: string;
	/** Referenced column on the target. Default `"id"`. */
	targetColumn: string;
	/** Cardinality — mirrors `Referencible`. Default `"many-to-one"`. */
	cardinality: RelationCardinality;
	/** Referential action on delete. Default `"noAction"`. */
	onDelete: OnDelete;
}

/**
 * `SqlSchemaDef<T>` — the SQL (drizzle) projection a model may optionally bind.
 *
 * `toRow` / `fromRow` translate between the domain entity and a drizzle table
 * row; `table` is the concrete drizzle `Table` (sqlite-core OR pg-core — the
 * same mappers work for both because they only touch column NAME strings, not
 * the column-builder objects). It is produced by {@link toDrizzleTable} (the
 * `sql-tablisable` bridge) and consumed by the `SqlSerialisable` capacity
 * (which lifts `table` / `toRow` / `fromRow` onto the MODEL class) and the
 * `SqlBackend` provider (storage side). `relations` carries the foreign keys.
 */
export interface SqlSchemaDef<T, Tbl extends Table = Table> {
	table: Tbl;
	toRow: (e: T) => Record<string, unknown>;
	fromRow: (row: Record<string, unknown>) => T;
	/**
	 * Foreign-key relations on this table. Declared (not inferred) because the
	 * reflected schema alone cannot name the TARGET table/column. The
	 * `SqlSerialisable` capacity applies `.references()` to the FK column at
	 * derive time and surfaces these on the def; `SqlBackend` reads them for
	 * joinable querying. Absent for models with no relations.
	 */
	relations?: SqlRelationDef[];
}

/**
 * `SqlSchemaModule<T>` — a {@link SchemaModule} augmented with the optional
 * SQL projection slices (`sql`, `sqlPg`). Lives here (not on the core
 * `SchemaModule`) because SQL is a capacity concern, not part of the neutral
 * typia bundle. A model that composes `SqlSerialisable` is typed as this.
 */
export interface SqlSchemaModule<T, Tbl extends Table = Table>
	extends SchemaModule<T> {
	sql?: SqlSchemaDef<T, Tbl>;
	sqlPg?: SqlSchemaDef<T, Tbl>;
}

/** How a property is stored. Drives both the column builder and the mappers. */
type ColKind = "string" | "integer" | "number" | "boolean" | "enum" | "json";

interface ColPlan {
	name: string;
	kind: ColKind;
	nullable: boolean;
	isId: boolean;
	/** Decoded `Reference` tag, if this column is a foreign key. */
	reference?: ReferenceMeta;
}

/**
 * Normalize typia's object-or-array schema to the underlying object schema.
 * `typia.reflect.schema<T>()` yields an object schema directly, but
 * `typia.json.schema<[T]>()` wraps it in an array-of-one (`{ type: "array",
 * items: { type: "object", … } }`) — both must produce the same columns.
 */
function unwrapObject(schema: JsonSchema): JsonSchema {
	const isArray =
		schema.type === "array" ||
		(Array.isArray(schema.type) && schema.type.includes("array"));
	if (isArray && schema.items) return schema.items as JsonSchema;
	return schema;
}

function baseType(p: JsonProp): string | undefined {
	const t = p.type;
	if (Array.isArray(t)) return t.find((x) => x !== "null");
	return t;
}

function isNullable(p: JsonProp): boolean {
	if (p.nullable) return true;
	if (Array.isArray(p.type)) return p.type.includes("null");
	return false;
}

function isDate(p: JsonProp): boolean {
	return p.format === "date-time" || p.format === "date";
}

/** Map a reflected property to a storage strategy. */
function kindOf(p: JsonProp): ColKind {
	if (p.enum && p.enum.length > 0) return "enum";
	if (isDate(p)) return "string"; // ISO strings round-trip as text
	const t = baseType(p);
	if (t === "string") return "string";
	if (t === "integer") return "integer";
	if (t === "number") return "number";
	if (t === "boolean") return "boolean";
	// object / array / unknown → JSON-encoded text column
	return "json";
}

function planColumns(schema: JsonSchema): ColPlan[] {
	const obj = unwrapObject(schema);
	const props = obj.properties ?? {};
	return Object.entries(props).map(([name, p]) => ({
		name,
		kind: kindOf(p),
		nullable: isNullable(p),
		isId: name === "id",
		reference: name !== "id" ? referenceOf(p) : undefined,
	}));
}

function buildColumns(plans: ColPlan[], dialect: SqlDialect): Record<string, any> {
	const cols: Record<string, any> = {};
	for (const c of plans) {
		// Default keeps the column non-nullable-safe if a kind is somehow missed.
		let col: any = dialect === "sqlite" ? sText(c.name) : pText(c.name);
		switch (c.kind) {
			case "string":
			case "enum":
			case "json":
				col = dialect === "sqlite" ? sText(c.name) : pText(c.name);
				break;
			case "integer":
				col = dialect === "sqlite" ? sInt(c.name) : pInt(c.name);
				break;
			case "number":
				col = dialect === "sqlite" ? sReal(c.name) : pDouble(c.name);
				break;
			case "boolean":
				// SQLite has no boolean: store 0/1. Postgres keeps a real bool.
				col = dialect === "sqlite" ? sInt(c.name) : pBool(c.name);
				break;
		}
		if (c.isId) col = col.primaryKey();
		else if (!c.nullable) col = col.notNull();

		// Foreign key → wire `.references()` against the registered target table.
		if (c.reference) {
			const targetThunk = resolveTableThunk(c.reference.target, dialect);
			const targetColumn = c.reference.column ?? "id";
			const onDelete = c.reference.onDelete ?? "noAction";
			col = col.references(() => targetThunk()[targetColumn], { onDelete });
		}

		cols[c.name] = col;
	}
	return cols;
}

/** Build the `SqlRelationDef[]` for a plan set (no FK resolution needed here). */
function planRelations(plans: ColPlan[]): SqlRelationDef[] {
	const rels: SqlRelationDef[] = [];
	for (const c of plans) {
		if (!c.reference) continue;
		rels.push({
			column: c.name,
			target: c.reference.target,
			targetColumn: c.reference.column ?? "id",
			cardinality: c.reference.cardinality ?? "many-to-one",
			onDelete: c.reference.onDelete ?? "noAction",
		});
	}
	return rels;
}

/**
 * Build dialect-aware row mappers. `toRow` emits ONLY columns the table knows
 * (so partial patches become partial `SET`s), JSON-encoding objects/arrays and
 * normalizing booleans/date-times per dialect. `fromRow` inverts.
 */
function makeMappers(plans: ColPlan[], dialect: SqlDialect) {
	const byName = new Map(plans.map((p) => [p.name, p]));

	const toRow = (e: any): Record<string, unknown> => {
		const row: Record<string, unknown> = {};
		for (const [name, plan] of byName) {
			if (!(name in e)) continue; // absent → partial update, skip
			const v = e[name];
			if (v == null) {
				if (!plan.nullable) continue; // never write NULL into NOT NULL
				row[name] = null;
				continue;
			}
			switch (plan.kind) {
				case "json":
					row[name] = JSON.stringify(v);
					break;
				case "boolean":
					row[name] = dialect === "sqlite" ? (v ? 1 : 0) : !!v;
					break;
				case "string": // date-time: keep ISO; coerce a Date if given
					row[name] = v instanceof Date ? v.toISOString() : v;
					break;
				default:
					row[name] = v;
			}
		}
		return row;
	};

	const fromRow = (r: Record<string, unknown>): any => {
		const out: Record<string, unknown> = {};
		for (const [name, plan] of byName) {
			if (!(name in r)) continue;
			const v = r[name];
			if (v == null) {
				out[name] = null;
				continue;
			}
			switch (plan.kind) {
				case "json":
					out[name] = typeof v === "string" ? JSON.parse(v) : v;
					break;
				case "boolean":
					out[name] = dialect === "sqlite" ? (v === 1 || v === true) : !!v;
					break;
				case "string":
					out[name] = v instanceof Date ? v.toISOString() : v;
					break;
				default:
					out[name] = v;
			}
		}
		return out;
	};

	return { toRow, fromRow };
}

/**
 * Derive a Drizzle {@link SqlSchemaDef} from a reflected JSON schema.
 *
 * @example
 * const def = toDrizzleTable(userSchema, { dialect: "sqlite", name: "users" });
 * // def.table  — a `sqliteTable("users", { id: text.pk(), name: text.nn(), … })`
 * // def.toRow  — entity → row (booleans → 0/1, objects → JSON text)
 * // def.fromRow— row → entity
 */
export function toDrizzleTable<T = any>(
	schema: JsonSchema,
	options: SqlTablisableOptions,
): SqlSchemaDef<T> {
	const dialect = options.dialect ?? "sqlite";
	// `mod.schema` may be the full typia JSON-schema envelope
	// (`{ components, schema }`) or a bare object schema. Unwrap to the object.
	const root: JsonSchema =
		"schema" in schema && schema.schema && typeof schema.schema === "object"
			? (schema.schema as JsonSchema)
			: schema;

	// Order matters: plans must be computed before building columns, because
	// `buildColumns` resolves FK `.references()` against the registry, which
	// requires the TARGET table to already be registered. The caller (the
	// SqlSerialisable capacity) is responsible for deriving targets first.
	const plans = planColumns(root);
	const columns = buildColumns(plans, dialect);
	const { toRow, fromRow } = makeMappers(plans, dialect);
	const table =
		dialect === "sqlite"
			? sqliteTable(options.name, columns)
			: pgTable(options.name, columns);

	// Register BEFORE returning so later tables can reference this one.
	if (options.modelName) {
		registerTable(options.modelName, dialect, () => table as Table);
	}

	const relations = planRelations(plans);
	return {
		table: table as any,
		toRow,
		fromRow,
		...(relations.length ? { relations } : {}),
	};
}
