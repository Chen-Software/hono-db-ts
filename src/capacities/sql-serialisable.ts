import type { Table } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
	boolean as pBool,
	check as pCheck,
	doublePrecision as pDouble,
	pgTable,
	integer as pInt,
	text as pText,
} from "drizzle-orm/pg-core";
import {
	check as sCheck,
	integer as sInt,
	sqliteTable,
	real as sReal,
	text as sText,
} from "drizzle-orm/sqlite-core";
import type {
	OnDelete,
	RelationCardinality,
	ReferenceMeta,
} from "../tags/reference";
import { readReference } from "../tags/reference";
import type { CapacityComposer } from "./compose";
import type { ComposeContext } from "./compose";
import type { SchemaModule } from "./schema-module";

/**
 * `SqlSerialisable` — the SQL capacity, and the model → Drizzle bridge.
 *
 * This single file is the home of BOTH:
 *   1. the bridge helpers (`toDrizzleTable`, `deriveSqlPlan`, `SqlSchemaDef`,
 *      `SqlTablisableOptions`, …) that turn a reflected typia JSON schema into
 *      a real Drizzle table + row mappers; and
 *   2. the `SqlSerialisable` capacity that consumes those helpers at compose
 *      time and lifts `table` / `toRow` / `fromRow` onto the model class.
 *
 * (Historically the bridge lived in a separate `sql-tablisable.ts` file. That
 * name was misleading — `sql-tablisable` is an *adjective* for the class result
 * ("the class is tablisable: it has a `.table`"), not a second capacity. The
 * bridge and the capacity are now merged here so there is exactly one SQL
 * home, and `SqlSerialisable` (registered in `compose.ts`) is the only SQL
 * capacity name.)
 *
 * typia's reflected JSON schema (`typia.json.schema<T>()`, surfaced on the
 * model as `mod.schema`) is a JSON Schema object whose properties carry our
 * custom `Reference` tag as an `x-reference` extension. The bridge turns THAT
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

// ---------------------------------------------------------------------------
// Bridge section — reflected schema → Drizzle table + row mappers.
// ---------------------------------------------------------------------------

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
	/** Owner-side join mode. Default `"left"`. */
	join?: "inner" | "left" | "right" | "full";
	/** Explicit accessor name (without `get`). Derived from `target` if absent. */
	name?: string;
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
export function resolveTableThunk(
	modelName: string,
	dialect: SqlDialect,
): () => Table {
	const thunk = tableRegistry.get(regKey(modelName, dialect));
	if (!thunk) {
		throw new Error(
			`sql-serialisable: table "${modelName}" (${dialect}) was referenced via a ` +
				`Reference tag but never derived. Make sure the target model composes ` +
				`SqlSerialisable so toDrizzleTable runs for it first.`,
		);
	}
	return thunk;
}

/** The slice of typia's `IJsonSchema` we actually read. */
export interface JsonProp {
	type?: string | string[];
	format?: string;
	nullable?: boolean;
	enum?: readonly unknown[];
	oneOf?: JsonProp[];
	const?: unknown;
	items?: JsonSchema;
	properties?: Record<string, JsonProp>;
	required?: string[];
	// numeric / string bounds → emitted as CHECK constraints when `check: true`
	minimum?: number;
	maximum?: number;
	exclusiveMinimum?: number | boolean;
	exclusiveMaximum?: number | boolean;
	minLength?: number;
	maxLength?: number;
	pattern?: string;
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
	/**
	 * Emit SQL `CHECK` constraints derived from the reflected JSON-schema bounds
	 * (minimum/maximum/exclusive*, minLength/maxLength, pattern, enum membership).
	 * Default `true`. Set `false` to skip — e.g. when validation is enforced
	 * elsewhere (typia runtime validators) and you want leaner DDL.
	 */
	check?: boolean;
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
 * bridge) and consumed by the `SqlSerialisable` capacity (which lifts `table` /
 * `toRow` / `fromRow` onto the MODEL class) and the `SqlBackend` provider
 * (storage side). `relations` carries the foreign keys.
 */
/**
 * `SqlCheckDef` — one `CHECK` constraint on a model's SQL table, derived from a
 * JSON-schema bound on a property (e.g. `minimum`, `maxLength`, `pattern`,
 * enum membership). The `expression` is a dialect-agnostic SQL fragment quoting
 * the column name (`"col" >= 3`); drizzle binds it via `check(name, sql\`…\`)`.
 */
export interface SqlCheckDef {
	/** Constraint name, e.g. `"posts_title_minlen"`. */
	name: string;
	/** Raw SQL boolean expression (column quoted with `"`). */
	expression: string;
}

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
	/**
	 * `CHECK` constraints derived from the reflected bounds (when `check` is on).
	 * Absent when no bounds were declared or `check: false`.
	 */
	checks?: SqlCheckDef[];
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

interface ColBounds {
	minimum?: number;
	maximum?: number;
	exclusiveMinimum?: number | boolean;
	exclusiveMaximum?: number | boolean;
	minLength?: number;
	maxLength?: number;
	pattern?: string;
	enum?: readonly unknown[];
}

interface ColPlan {
	name: string;
	kind: ColKind;
	nullable: boolean;
	isId: boolean;
	/** Decoded `Reference` tag, if this column is a foreign key. */
	reference?: ReferenceMeta;
	/** Reflected numeric / string bounds → CHECK constraints. */
	bounds?: ColBounds;
}

/**
 * Normalise typia's object-or-array schema to the underlying object schema.
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

/**
 * Derive the model name to register under, from the typia JSON-schema envelope.
 * `typia.json.schema<T>()` (and the array form `typia.json.schema<[T]>()`) emits
 * `components.schemas.<ModelName>`, which is exactly the key other models'
 * `Reference` tags target. Falls back to an explicit `modelName` option.
 */
function modelNameOf(
	schema: JsonSchema,
	fallback?: string,
): string | undefined {
	const schemas = (schema as Record<string, any>)?.components?.schemas;
	if (schemas && typeof schemas === "object") {
		const keys = Object.keys(schemas);
		if (keys.length === 1) return keys[0];
		if (keys.length > 1) return fallback ?? keys[0];
	}
	return fallback;
}

function baseType(p: JsonProp): string | undefined {
	const t = p.type;
	if (Array.isArray(t)) return t.find((x) => x !== "null");
	return t;
}

function isNullable(p: JsonProp): boolean {
	if (p.nullable) return true;
	if (Array.isArray(p.type)) return p.type.includes("null");
	// A `oneOf` union containing a `{ type: "null" }` member is a nullable
	// scalar (e.g. `UUID | null`); the null branch carries no storage kind.
	if (Array.isArray(p.oneOf)) {
		return p.oneOf.some(
			(m) =>
				m.type === "null" ||
				(Array.isArray(m.type) && m.type.length === 1 && m.type[0] === "null"),
		);
	}
	return false;
}

function isDate(p: JsonProp): boolean {
	return p.format === "date-time" || p.format === "date";
}

/** Map a reflected property to a storage strategy. */
/**
 * Classify one member of a `oneOf` union. A member that is a scalar (a bare
 * `type`, or a `const` literal) yields that scalar kind; an object/array member
 * means the union is a genuine *variant* (not a scalar union) and is reported as
 * `"json"` so the whole column degrades to JSON text. A `null`-only member
 * (`{ type: "null" }`) is a *nullable* marker, not a real variant — it yields
 * `null` (sentinel) so the caller can ignore it when deciding the column's
 * scalar kind. Without this, `UUID | null` would be misread as a JSON column.
 */
function oneOfMemberKind(m: JsonProp): ColKind | null {
	if (m.type === "null" || (Array.isArray(m.type) && m.type.length === 1 && m.type[0] === "null"))
		return null;
	if (m.const !== undefined) {
		if (typeof m.const === "string") return "string";
		if (typeof m.const === "number")
			return Number.isInteger(m.const) ? "integer" : "number";
		if (typeof m.const === "boolean") return "boolean";
		return "json";
	}
	const t = baseType(m);
	if (t === "string") return "string";
	if (t === "integer") return "integer";
	if (t === "number") return "number";
	if (t === "boolean") return "boolean";
	// object / array member → real variant, not a scalar union
	if (m.type === "object" || m.type === "array" || m.properties || m.items)
		return "json";
	return "json";
}

/**
 * Map a reflected property to a storage strategy.
 *
 * typia reflects branded strings (e.g. `UUID`) and string-literal unions
 * (`"admin" | "member" | "viewer"`) as a `oneOf` with NO top-level `type`, so a
 * naive `baseType` lookup returns `undefined`. Those are still scalar strings and
 * must be stored as TEXT (raw), not JSON-encoded — otherwise the stored value is
 * double-quoted (`"\"<uuid>\""`) and keyed lookups / `WHERE` filters never match.
 * We therefore inspect `oneOf` members: if every member is a scalar, the column
 * takes the most general scalar kind; only if some member is an object/array does
 * it degrade to `"json"`.
 */
function kindOf(p: JsonProp): ColKind {
	if (p.enum && p.enum.length > 0) return "enum";
	if (isDate(p)) return "string"; // ISO strings round-trip as text
	const t = baseType(p);
	if (t === "string") return "string";
	if (t === "integer") return "integer";
	if (t === "number") return "number";
	if (t === "boolean") return "boolean";
	// No top-level `type`: inspect a `oneOf` union, if present. `null`-only
	// members are filtered out — they're nullable markers, not real variants,
	// so `UUID | null` is still a TEXT column (not JSON).
	if (Array.isArray(p.oneOf) && p.oneOf.length > 0) {
		const kinds = p.oneOf
			.map(oneOfMemberKind)
			.filter((k): k is ColKind => k !== null);
		if (kinds.length === 0) return "string"; // only a null member
		if (kinds.every((k) => k === "string")) return "string";
		// Any non-scalar member ⇒ genuine variant ⇒ JSON-encode.
		if (kinds.some((k) => k === "json")) return "json";
		// Pure scalar union (mixed numeric/boolean): pick the most general kind.
		if (kinds.includes("string")) return "string";
		if (kinds.includes("number")) return "number";
		if (kinds.includes("integer")) return "integer";
		if (kinds.includes("boolean")) return "boolean";
	}
	// object / array / unknown → JSON-encoded text column
	return "json";
}

function planColumns(schema: JsonSchema): ColPlan[] {
	const obj = unwrapObject(schema);
	const props = obj.properties ?? {};
	// A property is nullable when typia marks it `nullable`/union-with-null, OR
	// when it is NOT listed in `required` (i.e. it is OPTIONAL, e.g. `parentId?`).
	// The reflected `required` array is the authoritative source for the latter.
	const required = Array.isArray(obj.required)
		? new Set(obj.required as string[])
		: null;
	return Object.entries(props).map(([name, p]) => {
		// Enum membership: typia emits either `enum: [...]` (TS `enum`/tuple) or
		// `oneOf: [{ const: ... }, ...]` (a union of string/number literals).
		const unionConsts = Array.isArray((p as JsonProp).oneOf)
			? ((p as JsonProp).oneOf as JsonProp[])
					.map((o) => o.const)
					.filter((v) => v !== undefined)
			: [];
		const enumVals =
			p.enum && p.enum.length > 0
				? (p.enum as readonly unknown[])
				: unionConsts.length > 0
					? unionConsts
					: undefined;

		const hasBounds =
			p.minimum !== undefined ||
			p.maximum !== undefined ||
			p.exclusiveMinimum !== undefined ||
			p.exclusiveMaximum !== undefined ||
			p.minLength !== undefined ||
			p.maxLength !== undefined ||
			p.pattern !== undefined ||
			enumVals !== undefined;
		return {
			name,
			kind: kindOf(p),
			// Optional (not in `required`) ⇒ nullable. `isNullable` covers explicit
			// `nullable`/union-with-null; the required-list check covers `field?`.
			nullable: isNullable(p) || (required != null && !required.has(name)),
			isId: name === "id",
			reference: name !== "id" ? readReference(p) : undefined,
			...(hasBounds
				? {
						bounds: {
							...(p.minimum !== undefined ? { minimum: p.minimum } : {}),
							...(p.maximum !== undefined ? { maximum: p.maximum } : {}),
							...(p.exclusiveMinimum !== undefined
								? { exclusiveMinimum: p.exclusiveMinimum }
								: {}),
							...(p.exclusiveMaximum !== undefined
								? { exclusiveMaximum: p.exclusiveMaximum }
								: {}),
							...(p.minLength !== undefined ? { minLength: p.minLength } : {}),
							...(p.maxLength !== undefined ? { maxLength: p.maxLength } : {}),
							...(p.pattern !== undefined ? { pattern: p.pattern } : {}),
							...(enumVals ? { enum: enumVals } : {}),
						} as ColBounds,
					}
				: {}),
		};
	});
}

/**
 * Build `CHECK` constraints from a plan set. Each bound becomes a dialect-agnostic
 * SQL expression quoting the column (`"col"`). `exclusiveMinimum`/`exclusiveMaximum`
 * may be a boolean (`true` with no numeric value is ignored) or a number.
 * `pattern` uses the Postgres `~` regex operator (sqlite has no portable regexp,
 * so for sqlite we fall back to a no-op comment-only constraint — see
 * {@link buildChecks} which skips un-enforceable patterns on sqlite).
 */
function planChecks(plans: ColPlan[], dialect: SqlDialect): SqlCheckDef[] {
	const checks: SqlCheckDef[] = [];
	const q = (col: string) => `"${col}"`;
	for (const c of plans) {
		const b = c.bounds;
		if (!b) continue;
		const col = q(c.name);
		if (b.minimum !== undefined)
			checks.push({
				name: `${c.name}_min`,
				expression: `${col} >= ${b.minimum}`,
			});
		if (b.maximum !== undefined)
			checks.push({
				name: `${c.name}_max`,
				expression: `${col} <= ${b.maximum}`,
			});
		if (typeof b.exclusiveMinimum === "number")
			checks.push({
				name: `${c.name}_exclmin`,
				expression: `${col} > ${b.exclusiveMinimum}`,
			});
		if (typeof b.exclusiveMaximum === "number")
			checks.push({
				name: `${c.name}_exclmax`,
				expression: `${col} < ${b.exclusiveMaximum}`,
			});
		if (b.minLength !== undefined)
			checks.push({
				name: `${c.name}_minlen`,
				expression: `length(${col}) >= ${b.minLength}`,
			});
		if (b.maxLength !== undefined)
			checks.push({
				name: `${c.name}_maxlen`,
				expression: `length(${col}) <= ${b.maxLength}`,
			});
		if (b.enum && b.enum.length > 0) {
			const list = b.enum
				.map((v) => `'${String(v).replace(/'/g, "''")}'`)
				.join(", ");
			checks.push({
				name: `${c.name}_enum`,
				expression: `${col} IN (${list})`,
			});
		}
		// `pattern`: enforceable on Postgres (`~`); sqlite lacks portable regexp.
		if (b.pattern) {
			const re = `'${b.pattern.replace(/'/g, "''")}'`;
			checks.push({
				name: `${c.name}_pattern`,
				expression: dialect === "pg" ? `${col} ~ ${re}` : `${col} REGEXP ${re}`,
			});
		}
	}
	return checks;
}

function buildColumns(
	plans: ColPlan[],
	dialect: SqlDialect,
): Record<string, any> {
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
		// Resolution is deferred INSIDE drizzle's thunk so two models can
		// reference each other without a circular-import failure at module load
		// (mirroring `Referencible`'s `target: () => Class`): by the time drizzle
		// evaluates the thunk at query-plan time, the target table has been
		// derived and registered.
		if (c.reference) {
			const targetName = c.reference.target;
			const targetColumn = c.reference.column ?? "id";
			const onDelete = c.reference.onDelete ?? "noAction";
			col = col.references(
				() => resolveTableThunk(targetName, dialect)()[targetColumn],
				{ onDelete },
			);
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
					out[name] = dialect === "sqlite" ? v === 1 || v === true : !!v;
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
 * `SqlModelPlan` — a SERIAlisaBLE, drizzle-free description of a model's SQL
 * projection. Produced at BUILD TIME by `scripts/model-build.ts` (where typia
 * still runs) and saved to `src/generated/models.json`. `scripts/db-generate.ts`
 * turns it into migration SQL; the runtime never needs typia because the plan
 * already carries everything (`kind`, `nullable`, `isId`, `reference`, checks).
 *
 * This is the build-time artifact the user asked for: models are DERIVED during
 * build, not at import time on Cloudflare Workers. The `ColPlan` shape is the
 * raw plan; `SqlModelPlan` adds the table name + relations so generation is
 * self-contained.
 */
export interface SqlModelPlan {
	/** Table name, e.g. `"users"`. */
	name: string;
	/** Primary dialect the plan was derived for. */
	dialect: SqlDialect;
	/** Resolved model name used for FK lookups ("UserSchema"). */
	modelName?: string;
	/** Column plans — serialisable, drizzle-free. */
	columns: ColPlan[];
	/** Foreign-key relations (column ↔ target model). */
	relations: SqlRelationDef[];
	/** CHECK constraints derived from reflected bounds. */
	checks: SqlCheckDef[];
}

/**
 * Derive a {@link SqlModelPlan} from a reflected JSON schema. Unlike
 * {@link toDrizzleTable}, this builds NO drizzle `Table` and emits NO `sql`
 * template — it only plans, so the result is JSON-serialisable and can be saved
 * for the runtime to consume. Reuses the same `planColumns` / `planChecks` /
 * `planRelations` / `modelNameOf` helpers, so the plan stays in lockstep with
 * the live drizzle derivation.
 */
export function deriveSqlPlan(
	schema: JsonSchema,
	options: SqlTablisableOptions,
): SqlModelPlan {
	const dialect = options.dialect ?? "sqlite";
	const root: JsonSchema =
		"schema" in schema && schema.schema && typeof schema.schema === "object"
			? (schema.schema as JsonSchema)
			: schema;

	const columns = planColumns(root);
	const emitChecks = options.check !== false;
	const checks = emitChecks ? planChecks(columns, dialect) : [];
	const relations = planRelations(columns);
	const modelName = modelNameOf(schema, options.name);

	return {
		name: options.name,
		dialect,
		...(modelName ? { modelName } : {}),
		columns,
		relations,
		checks,
	};
}

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

	const plans = planColumns(root);
	const columns = buildColumns(plans, dialect);
	const { toRow, fromRow } = makeMappers(plans, dialect);

	// Build CHECK constraints (default ON unless explicitly opted out).
	const emitChecks = options.check !== false;
	const checks = emitChecks ? planChecks(plans, dialect) : [];

	// Table extra callback carries the CHECK constraints (and would also carry
	// additional table-level FKs if we ever need them). Omit the callback when
	// there are no checks so the table def stays minimal.
	const tableExtra = checks.length
		? (t: Record<string, any>) =>
				checks.map((c) =>
					dialect === "sqlite"
						? sCheck(c.name, sql.raw(c.expression))
						: pCheck(c.name, sql.raw(c.expression)),
				)
		: undefined;

	const table =
		dialect === "sqlite"
			? sqliteTable(options.name, columns, tableExtra as any)
			: pgTable(options.name, columns, tableExtra as any);

	// Register BEFORE returning so other tables can reference this one (FK
	// targets resolve lazily through `tableRegistry`, circular-safe).
	const modelName = modelNameOf(schema, options.modelName);
	if (modelName) {
		registerTable(modelName, dialect, () => table as Table);
	}

	const relations = planRelations(plans);
	return {
		table: table as any,
		toRow,
		fromRow,
		...(relations.length ? { relations } : {}),
		...(checks.length ? { checks } : {}),
	};
}

// ---------------------------------------------------------------------------
// Capacity section — consumes the bridge above at compose time.
// ---------------------------------------------------------------------------

/**
 * Options for the {@link SqlSerialisable} capacity.
 *
 * `name` is required: the reflected schema has no reliable table name, so the
 * model must name its table (`"users"`, `"repositories"`, …). `dialect` picks
 * the *primary* projection; the opposite dialect is derived alongside it.
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
function SqlSerialisable<TBase extends CapacityComposer>(
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
	(Base.prototype as any).toRow = function (
		this: any,
	): Record<string, unknown> {
		return primaryDef.toRow(this);
	};

	return Base;
}

export { SqlSerialisable };
