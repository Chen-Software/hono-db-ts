/**
 * Servable — a capacity that turns a `SqlSerialisable` model into a Hono app
 * with GENERATED, SQL-backed read routes.
 *
 * It is the "models become HTTP endpoints" prototype. The route list + filters
 * are NOT hand-written (no more per-model `serve.ts` boilerplate): they are
 * derived, at compose time, from the SAME two sources the rest of the
 * architecture already uses:
 *
 *   1. `SqlSerialisable` — the derived drizzle `table` (name + columns) the
 *      model composes; this is where the SQL actually runs against (via a
 *      caller-supplied client — Bun's `SQL` or anything exposing `unsafe`).
 *   2. `Queriable` — the schema-inferred matcher table
 *      (`deriveFieldPlans`), REUSED verbatim so `?param=` means the same thing
 *      over SQL as it does in-memory: boolean → exact, date → range
 *      (`[min,max]` tuple, bare = exact day), string/uuid → substring,
 *      array → comma-list "contains all".
 *
 * Generated routes (registered by `static serve(app, client)`):
 *
 *   GET /<table>             — list: Queriable-style `?param=` filters + keyset
 *                              (cursor) pagination + sort (default `updated_at`
 *                              desc, exactly like `Siftable`).
 *   GET /<table>/:id         — one row by primary key (404 when absent).
 *   POST /<table>            — create: body is a domain object (JSON); it is
 *                              encoded through `SqlSerialisable.toRow`, missing
 *                              `id` / `created_at` / `updated_at` are generated,
 *                              and the row is inserted (201 with the decoded row).
 *   PUT /<table>/:id         — partial update: body is a field patch; the
 *                              existing row is merged, `updated_at` refreshed,
 *                              and ONLY the provided columns are `SET` (the
 *                              `toRow` mapper skips absent fields — no null
 *                              clobbering). Returns the updated row.
 *   DELETE /<table>/:id      — delete by primary key (404 when absent; returns
 *                              `{ id, deleted: true }`).
 *
 * The response envelope mirrors the hand-written server
 * (`{ ok: true, data }` / `{ ok: false, data: { error } }`), and rows are
 * decoded through the `SqlSerialisable` `fromRow` mapper, so booleans / JSON
 * columns come back as domain values, not storage encodings.
 *
 * Validation: when the model also composes `Validatable`, the static `assert`
 * (the strictest guard `Validatable` lifts) is run on the CREATE body and on
 * the MERGED update object before any write — a bad payload never reaches SQL.
 * This is what gives "every Servable model gets CRUD" its safety net.
 *
 * Design constraints (prototype):
 *   - The join-heavy "good BBS queries" (`/boards/:id/hot`, `/threads/:id` with
 *     author+count, `/search`) are multi-model read models — they stay as
 *     explicit handlers; `Servable` covers the per-model CRUD surface.
 *   - Composition order matters: `SqlSerialisable` MUST be declared BEFORE
 *     `Servable` (it lifts `table` / `fromRow` the capacity reads).
 *   - The SQL is built with `?` bind params (safe), quoting every identifier.
 *
 * @example
 * // model capacities: [..., SqlSerialisable, Queriable, Servable, ...]
 * const app = new Hono();
 * Board.serve(app, client);   // GET /boards, GET /boards/:id
 * Thread.serve(app, client);  // GET /threads, GET /threads/:id
 * Board.routeSpec();          // introspect what /boards accepts
 */

import { getTableName } from "drizzle-orm";
import type { Context, Hono } from "hono";

import type { CapacityComposer } from "./compose";
import type { ComposeContext } from "./compose";
import {
	deriveFieldPlans,
	type FieldPlan,
	type QueriableOptions,
} from "./queriable";
import {
	deriveSqlPlan,
	type JsonSchema,
	type SqlDialect,
} from "./sql-serialisable";

/**
 * The SQL query surface `Servable` needs. Bun's `SQL` client
 * (`new SQL(url)`, used by `serve.ts` / `seed.ts`) satisfies it, so the
 * capacity stays decoupled from the concrete driver and is testable.
 */
export interface SqlQueryExecutor {
	unsafe(sql: string, params?: unknown[]): Promise<unknown[]> | unknown[];
}

/** A `?param=` filter value — the same shape `Queriable.filter` accepts. */
type Query = Record<string, string | string[] | undefined>;

/** Options for the {@link Servable} capacity. */
export interface ServableOptions {
	/**
	 * Route base path. Defaults to `/<tableName>` (the drizzle table name),
	 * e.g. table `"boards"` → `GET /boards` + `GET /boards/:id`.
	 */
	path?: string;
	/**
	 * Default SQL client used by `serve(app)` when the caller omits one.
	 * Overridable per call: `Model.serve(app, otherClient)`.
	 */
	client?: SqlQueryExecutor;
	/** List sort. Default `{ field: "updated_at", dir: "desc" }` — falls back
	 *  to `created_at`, then the primary key, when the field doesn't exist. */
	sort?: { field?: string; dir?: "asc" | "desc" };
	/** Per-field matcher overrides — the EXACT `Queriable` option shape. */
	fields?: QueriableOptions["fields"];
	/** Default page size. Default 25. */
	defaultLimit?: number;
	/** Hard cap on page size. Default 100. */
	maxLimit?: number;
	/** Dialect the SQL targets. Default `"sqlite"` (must match `SqlSerialisable`). */
	dialect?: SqlDialect;
	/** Emit the `GET /<table>/:id` route. Default `true`. */
	byId?: boolean;
	/**
	 * Emit the write routes `POST /<table>`, `PUT /<table>/:id`,
	 * `DELETE /<table>/:id`. Default `true`.
	 */
	write?: boolean;
	/**
	 * Foreign-key child tables to delete BEFORE the row itself, so a delete
	 * succeeds when SQLite/D1 do not enforce `ON DELETE CASCADE` by default.
	 * e.g. `Thread` → `{ table: "replies", column: "threadId" }`.
	 */
	cascadeDelete?: Array<{ table: string; column: string }>;
}

/** The introspection surface `routeSpec()` returns — what a route accepts. */
export interface ServableRouteSpec {
	path: string;
	table: string;
	idColumn: string;
	dialect: SqlDialect;
	sort: { field: string; dir: "asc" | "desc" };
	limit: { default: number; max: number };
	fields: Array<{
		field: string;
		param: string;
		mode: string;
		isDate: boolean;
	}>;
	/** Whether write routes (POST/PUT/DELETE) are generated. */
	write: boolean;
}

/** The static API {@link Servable} contributes to the adorned class. */
export interface ServableStatic {
	/** Register `GET <path>` (+ `GET <path>/:id`) onto a Hono app. */
	serve(app: Hono, client?: SqlQueryExecutor): void;
	/** Introspect the generated routes: path, sort, accepted query params. */
	routeSpec(): ServableRouteSpec;
}

// ---------------------------------------------------------------------------
// SQL fragment helpers (all identifiers quoted, all values `?`-bound).
// ---------------------------------------------------------------------------

/** Quote a SQL identifier (table/column name). */
function quote(id: string): string {
	return `"${id.replace(/"/g, '""')}"`;
}

/** Escape LIKE wildcards so a user value is matched literally. */
function escapeLike(value: string): string {
	return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** `{ ok, data }` JSON responder — mirrors the hand-written server. */
function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify({ ok: status < 400, data }, null, 2), {
		status,
		headers: { "content-type": "application/json; charset=utf-8" },
	});
}

function fail(message: string, status = 400): Response {
	return json({ error: message }, status);
}

/** Parse + clamp a `?limit=` value to `[1, max]`. */
function parseLimit(raw: string | undefined, def: number, max: number): number {
	if (raw == null || raw === "") return def;
	const n = Number.parseInt(raw, 10);
	if (!Number.isFinite(n)) return def;
	return Math.min(Math.max(1, n), max);
}

interface Filters {
	clauses: string[];
	params: unknown[];
}

/**
 * Translate `?param=` values into SQL `WHERE` clauses using the EXACT matcher
 * table `Queriable` derives. Permissive like `Queriable`: unknown params,
 * empty values and unparseable range bounds are silently ignored. Exported so
 * sibling capacities (e.g. `Aggregable`) build their WHERE the SAME way — a
 * `?param=` filter means the same thing on the list route and on the
 * aggregate route.
 */
export function buildFilters(
	query: Query,
	fieldPlans: FieldPlan[],
	kinds: Map<string, string>,
	dialect: SqlDialect,
): Filters {
	const byParam = new Map<string, FieldPlan>();
	for (const fp of fieldPlans) {
		if (fp.mode === "none") continue;
		byParam.set(fp.param, fp);
	}

	const out: Filters = { clauses: [], params: [] };
	for (const [key, raw] of Object.entries(query)) {
		if (key === "limit" || key === "cursor") continue;
		const wanted = Array.isArray(raw) ? raw[0] : raw;
		if (wanted == null || wanted === "") continue;
		const fp = byParam.get(key);
		if (!fp) continue; // unknown param → ignore (never 400)

		const kind = kinds.get(fp.field) ?? "string";
		const col = quote(fp.field);
		switch (fp.mode) {
			case "eq":
				eqClause(out, col, kind, dialect, wanted);
				break;
			case "substring": {
				const op = dialect === "pg" ? "ILIKE" : "LIKE";
				out.clauses.push(`${col} ${op} ? ESCAPE '\\'`);
				out.params.push(`%${escapeLike(wanted)}%`);
				break;
			}
			case "range":
				rangeClause(out, col, fp, kind, dialect, wanted);
				break;
			case "list": {
				// JSON array column: "contains ALL elements" (LIKE per element —
				// the SQL approximation of `Queriable`'s matchList).
				for (const el of wanted.split(",")) {
					const e = el.trim();
					if (!e) continue;
					out.clauses.push(`${col} LIKE ? ESCAPE '\\'`);
					out.params.push(`%"${escapeLike(e)}"%`);
				}
				break;
			}
			case "none":
			default:
				break;
		}
	}
	return out;
}

/** Exact equality — mirrors `Queriable.matchEq` (booleans, numbers, strings). */
function eqClause(
	out: Filters,
	col: string,
	kind: string,
	dialect: SqlDialect,
	wanted: string,
): void {
	if (kind === "boolean") {
		const v = wanted === "true" || wanted === "1";
		out.clauses.push(
			dialect === "sqlite" ? `${col} = ${v ? 1 : 0}` : `${col} = ${v}`,
		);
		return;
	}
	if (kind === "integer" || kind === "number") {
		const n = Number(wanted);
		if (Number.isNaN(n)) return;
		out.clauses.push(`${col} = ?`);
		out.params.push(n);
		return;
	}
	// Case-insensitive exact match, like `Queriable`'s string `matchEq`.
	out.clauses.push(`LOWER(${col}) = LOWER(?)`);
	out.params.push(wanted);
}

/**
 * Range-capable clause — mirrors `Queriable.matchRangeValue`: a BARE value is
 * an EXACT match (day-level for dates); only `[min,max]` is a closed range.
 */
function rangeClause(
	out: Filters,
	col: string,
	fp: FieldPlan,
	kind: string,
	dialect: SqlDialect,
	wanted: string,
): void {
	const trimmed = wanted.trim();
	if (trimmed.startsWith("[") && trimmed.endsWith("]") && trimmed.length >= 2) {
		const parts = trimmed
			.slice(1, -1)
			.split(",")
			.map((s) => s.trim());
		if (parts.length >= 2) {
			const [minRaw, maxRaw] = parts;
			// Dates compare at DAY level (like `Queriable.matchDateRange`) —
			// a `[2020-01-01,2020-12-31]` bound must include rows stored as
			// full ISO date-times, so compare through `date()` / `::date`.
			if (fp.isDate) {
				const day = (x: string) =>
					dialect === "pg" ? `${x}::date` : `date(${x})`;
				if (minRaw) {
					out.clauses.push(`${day(col)} >= ${day("?")}`);
					out.params.push(minRaw);
				}
				if (maxRaw) {
					out.clauses.push(`${day(col)} <= ${day("?")}`);
					out.params.push(maxRaw);
				}
				return;
			}
			const isNum = kind === "integer" || kind === "number";
			if (minRaw) {
				if (isNum && Number.isNaN(Number(minRaw))) return;
				out.clauses.push(`${col} >= ?`);
				out.params.push(isNum ? Number(minRaw) : minRaw);
			}
			if (maxRaw) {
				if (isNum && Number.isNaN(Number(maxRaw))) return;
				out.clauses.push(`${col} <= ?`);
				out.params.push(isNum ? Number(maxRaw) : maxRaw);
			}
			return;
		}
	}
	// Bare value → exact match (dates are day-level, like `Queriable`).
	if (fp.isDate) {
		out.clauses.push(
			dialect === "pg" ? `${col}::date = ?::date` : `substr(${col}, 1, 10) = ?`,
		);
		out.params.push(trimmed);
		return;
	}
	if (kind === "integer" || kind === "number") {
		const n = Number(trimmed);
		if (Number.isNaN(n)) return;
		out.clauses.push(`${col} = ?`);
		out.params.push(n);
		return;
	}
	out.clauses.push(`${col} = ?`);
	out.params.push(trimmed);
}

// ---------------------------------------------------------------------------
// Capacity section.
// ---------------------------------------------------------------------------

export function Servable<TBase extends CapacityComposer>(
	Base: TBase,
	_mod?: unknown,
	options: ServableOptions = {},
	_ctx?: ComposeContext,
): TBase {
	Base.prototype.capacities && Base.prototype.addCapacity?.("Servable");

	const schema = (Base.prototype as any).schemaModule?.schema as
		| JsonSchema
		| undefined;
	if (!schema) {
		throw new Error(
			"Servable: model has no reflected schema (schemaModule.schema) — " +
				"compose Triggerable first.",
		);
	}

	const table = (Base as any).table;
	if (!table) {
		throw new Error(
			"Servable: model has no derived drizzle `table` — compose " +
				"SqlSerialisable BEFORE Servable.",
		);
	}
	const fromRow = (Base as any).fromRow as
		| ((row: Record<string, unknown>) => unknown)
		| undefined;

	const tableName = getTableName(table as any);
	const dialect = options.dialect ?? "sqlite";

	// Column kinds + primary key from the SAME plan SqlSerialisable derives.
	const plan = deriveSqlPlan(schema, { name: tableName, dialect });
	const kinds = new Map<string, string>();
	let idCol = "id";
	for (const col of plan.columns) {
		kinds.set(col.name, col.kind);
		if (col.isId) idCol = col.name;
	}

	// Matcher table for `?param=` semantics. Prefer the plans `Queriable`
	// already lifted onto the class (single source of truth for field aliases
	// like `?mail=`), so a `fields` override declared once on `Queriable` is
	// automatically honored here. Fall back to deriving from `options.fields`
	// only when `Queriable` was NOT composed (Servable-without-Queriable).
	const inheritedPlans = (Base as any).fieldPlans as FieldPlan[] | undefined;
	const fieldPlans =
		inheritedPlans && inheritedPlans.length > 0
			? inheritedPlans
			: deriveFieldPlans(schema, { fields: options.fields });

	// List sort: `updated_at` desc, falling back to `created_at` / the PK so a
	// model without a natural sort key (e.g. `User`) still works.
	let sortField = options.sort?.field ?? "updated_at";
	if (!kinds.has(sortField)) {
		sortField = kinds.has("created_at") ? "created_at" : idCol;
	}
	const sortDir = options.sort?.dir ?? "desc";

	const basePath = options.path ?? `/${tableName}`;
	const defaultLimit = options.defaultLimit ?? 25;
	const maxLimit = options.maxLimit ?? 100;
	const withById = options.byId !== false;

	async function runList(
		c: Context,
		exec: SqlQueryExecutor,
	): Promise<Response> {
		try {
			const query = c.req.query();
			const limit = parseLimit(query["limit"], defaultLimit, maxLimit);
			const cursor = query["cursor"];

			const filters = buildFilters(query, fieldPlans, kinds, dialect);
			const where = filters.clauses;
			const params = filters.params;

			// Keyset cursor — `WHERE sortKey < ? ORDER BY sortKey DESC` (the
			// same semantics `Siftable` implements in-memory).
			const sortCol = quote(sortField);
			if (cursor) {
				const op = sortDir === "desc" ? "<" : ">";
				const isNum =
					kinds.get(sortField) === "integer" ||
					kinds.get(sortField) === "number";
				if (isNum && !Number.isNaN(Number(cursor))) {
					where.push(`${sortCol} ${op} ?`);
					params.push(Number(cursor));
				} else {
					where.push(`${sortCol} ${op} ?`);
					params.push(cursor);
				}
			}

			// Fetch one extra row to detect whether a next page exists.
			const sql =
				`SELECT * FROM ${quote(tableName)}` +
				(where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "") +
				` ORDER BY ${sortCol} ${sortDir === "asc" ? "ASC" : "DESC"} LIMIT ?`;
			params.push(limit + 1);

			const rows = (await exec.unsafe(sql, params)) as Record<
				string,
				unknown
			>[];
			const hasMore = rows.length > limit;
			const page = hasMore ? rows.slice(0, limit) : rows;
			const last = page[page.length - 1];
			const nextCursor =
				hasMore && last && last[sortField] != null
					? String(last[sortField])
					: null;

			const mapped = page.map((r) => (fromRow ? fromRow(r) : r));
			return json({ rows: mapped, nextCursor });
		} catch (err) {
			return fail(`servable ${basePath}: ${(err as Error).message}`, 500);
		}
	}

	async function runById(
		c: Context,
		exec: SqlQueryExecutor,
	): Promise<Response> {
		try {
			const id = c.req.param("id");
			const rows = (await exec.unsafe(
				`SELECT * FROM ${quote(tableName)} WHERE ${quote(idCol)} = ? LIMIT 1`,
				[id],
			)) as Record<string, unknown>[];
			if (!rows[0]) return fail(`${basePath}/${id} not found`, 404);
			return json(fromRow ? fromRow(rows[0]) : rows[0]);
		} catch (err) {
			return fail(`servable ${basePath}/:id: ${(err as Error).message}`, 500);
		}
	}

	// -----------------------------------------------------------------------
	// Write routes — the CRUD "U" (and C/D) for every Servable model.
	//
	//   POST   <path>      → create   (201 + decoded row)
	//   PUT    <path>/:id  → partial update (only provided columns are SET)
	//   DELETE <path>/:id  → delete   ({ id, deleted: true })
	//
	// Bodies are DOMAIN objects: they go through `toRow` (the same mapper
	// `SqlSerialisable` uses), so booleans → 0/1, objects → JSON text, and
	// absent fields are skipped (partial update never null-clobbers). When the
	// model composes `Validatable`, the static `assert` guards the CREATE body
	// and the MERGED update object before any write.
	// -----------------------------------------------------------------------
	const toRow = (Base as any).toRow as
		| ((e: Record<string, unknown>) => Record<string, unknown>)
		| undefined;
	const assertFn = (Base as any).assert as
		| ((input: unknown) => unknown)
		| undefined;
	const withWrites = options.write !== false;
	const cascades = options.cascadeDelete ?? [];

	async function runCreate(
		c: Context,
		exec: SqlQueryExecutor,
	): Promise<Response> {
		try {
			const body = await c.req.json();
			if (!body || typeof body !== "object" || Array.isArray(body)) {
				return fail("body must be a JSON object");
			}

			const entity: Record<string, unknown> = { ...body };
			// Server-managed fields: the client NEVER decides the final value
			// of the primary key / creation time / update time. The PK is
			// generated when absent (a client-supplied `id` is honoured for
			// idempotent creates); timestamps are ALWAYS taken from the
			// server clock so a client cannot forge created_at/updated_at.
			const now = new Date().toISOString();
			if (entity[idCol] == null || entity[idCol] === "") {
				entity[idCol] = crypto.randomUUID();
			}
			if (kinds.has("created_at")) {
				entity["created_at"] = now;
			}
			if (kinds.has("updated_at")) {
				entity["updated_at"] = now;
			}

			// Fill DEFAULTS for omitted columns so a create with only the
			// meaningful fields (e.g. UI forms posting {title,board,author})
			// still validates: booleans → false. Optional/nullable columns are
			// left UNSET — typia accepts `undefined` for `field?` (but rejects
			// `null`), and `toRow` skips unset fields, so the storage side
			// (DB column nullability / DEFAULT) covers them. Genuinely required
			// non-boolean values (title, FKs) stay missing and `assert` 400s.
			for (const col of plan.columns) {
				if (col.isId || entity[col.name] != null) continue;
				if (col.kind === "boolean") entity[col.name] = false;
			}

			// Validatable guard (strictest): a bad create never reaches SQL.
			if (assertFn) {
				try {
					assertFn(entity);
				} catch (err) {
					return fail(`invalid ${tableName}: ${(err as Error).message}`, 400);
				}
			}

			const row = toRow ? toRow(entity) : entity;
			const cols = Object.keys(row);
			if (cols.length === 0) return fail("no columns to insert");
			const placeholders = cols.map(() => "?").join(", ");
			await exec.unsafe(
				`INSERT INTO ${quote(tableName)} (${cols.map(quote).join(", ")}) ` +
					`VALUES (${placeholders})`,
				cols.map((k) => row[k]),
			);

			const created = (
				(await exec.unsafe(
					`SELECT * FROM ${quote(tableName)} WHERE ${quote(idCol)} = ? LIMIT 1`,
					[entity[idCol]],
				)) as Record<string, unknown>[]
			)[0];
			return json(fromRow ? fromRow(created) : created, 201);
		} catch (err) {
			return fail(`servable POST ${basePath}: ${(err as Error).message}`, 500);
		}
	}

	async function runUpdate(
		c: Context,
		exec: SqlQueryExecutor,
	): Promise<Response> {
		try {
			const id = c.req.param("id");
			const rows = (await exec.unsafe(
				`SELECT * FROM ${quote(tableName)} WHERE ${quote(idCol)} = ? LIMIT 1`,
				[id],
			)) as Record<string, unknown>[];
			if (!rows[0]) return fail(`${basePath}/${id} not found`, 404);

			const body = await c.req.json();
			if (!body || typeof body !== "object" || Array.isArray(body)) {
				return fail("body must be a JSON object");
			}

			// Merge the patch onto the current row (domain values, so `fromRow`
			// first), refresh `updated_at`, then encode — `toRow` skips absent
			// fields, so ONLY the provided columns (plus the timestamp) are SET.
			const current = (fromRow ? fromRow(rows[0]) : rows[0]) as Record<
				string,
				unknown
			>;
			// Server-managed fields are never taken from the patch: the PK is
			// pinned to the URL id and `created_at` stays whatever it was. Any
			// client-supplied value for them is ignored (not merged).
			const merged: Record<string, unknown> = { ...current };
			for (const [k, v] of Object.entries(body)) {
				if (k === idCol || k === "created_at") continue;
				merged[k] = v;
			}
			merged[idCol] = id;
			if (kinds.has("updated_at"))
				merged["updated_at"] = new Date().toISOString();

			if (assertFn) {
				try {
					assertFn(merged);
				} catch (err) {
					return fail(`invalid ${tableName}: ${(err as Error).message}`, 400);
				}
			}

			const row = toRow ? toRow(merged) : merged;
			const sets = Object.keys(row).filter((k) => k !== idCol);
			if (sets.length === 0) return json(current);
			await exec.unsafe(
				`UPDATE ${quote(tableName)} SET ${sets.map((k) => `${quote(k)} = ?`).join(", ")} ` +
					`WHERE ${quote(idCol)} = ?`,
				[...sets.map((k) => row[k]), id],
			);

			const updated = (
				(await exec.unsafe(
					`SELECT * FROM ${quote(tableName)} WHERE ${quote(idCol)} = ? LIMIT 1`,
					[id],
				)) as Record<string, unknown>[]
			)[0];
			return json(fromRow ? fromRow(updated) : updated);
		} catch (err) {
			return fail(
				`servable PUT ${basePath}/:id: ${(err as Error).message}`,
				500,
			);
		}
	}

	async function runDelete(
		c: Context,
		exec: SqlQueryExecutor,
	): Promise<Response> {
		try {
			const id = c.req.param("id");
			const rows = (await exec.unsafe(
				`SELECT * FROM ${quote(tableName)} WHERE ${quote(idCol)} = ? LIMIT 1`,
				[id],
			)) as Record<string, unknown>[];
			if (!rows[0]) return fail(`${basePath}/${id} not found`, 404);

			// Delete FK children first when SQLite/D1 won't cascade for us.
			for (const child of cascades) {
				await exec.unsafe(
					`DELETE FROM ${quote(child.table)} WHERE ${quote(child.column)} = ?`,
					[id],
				);
			}
			await exec.unsafe(
				`DELETE FROM ${quote(tableName)} WHERE ${quote(idCol)} = ?`,
				[id],
			);
			return json({ id, deleted: true });
		} catch (err) {
			return fail(
				`servable DELETE ${basePath}/:id: ${(err as Error).message}`,
				500,
			);
		}
	}

	// ---- LIFT the serving surface onto the class (in place). --------------
	(Base as any).serve = function serve(
		app: Hono,
		client?: SqlQueryExecutor,
	): void {
		const exec = client ?? options.client;
		if (!exec) {
			throw new Error(
				`Servable: no SQL client for ${basePath} — pass one to ` +
					`serve(app, client) or set options.client at compose time.`,
			);
		}
		app.get(basePath, (c) => runList(c, exec));
		if (withById) app.get(`${basePath}/:id`, (c) => runById(c, exec));
		if (withWrites) {
			app.post(basePath, (c) => runCreate(c, exec));
			app.put(`${basePath}/:id`, (c) => runUpdate(c, exec));
			app.delete(`${basePath}/:id`, (c) => runDelete(c, exec));
		}
	};

	(Base as any).routeSpec = function routeSpec(): ServableRouteSpec {
		return {
			path: basePath,
			table: tableName,
			idColumn: idCol,
			dialect,
			sort: { field: sortField, dir: sortDir },
			limit: { default: defaultLimit, max: maxLimit },
			fields: fieldPlans.map((fp) => ({
				field: fp.field,
				param: fp.param,
				mode: fp.mode,
				isDate: fp.isDate,
			})),
			write: withWrites,
		};
	};

	return Base;
}

export { Servable as default };
