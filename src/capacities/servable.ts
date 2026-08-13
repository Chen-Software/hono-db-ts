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
 *
 * The response envelope mirrors the hand-written server
 * (`{ ok: true, data }` / `{ ok: false, data: { error } }`), and rows are
 * decoded through the `SqlSerialisable` `fromRow` mapper, so booleans / JSON
 * columns come back as domain values, not storage encodings.
 *
 * Design constraints (prototype):
 *   - READ-ONLY by design: it generates the two generic read routes only. The
 *     join-heavy "good BBS queries" (`/boards/:id/hot`, `/threads/:id` with
 *     author+count, `/search`) are multi-model read models — they stay as
 *     explicit handlers; `Servable` covers the per-model CRUD-ish surface.
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
 * empty values and unparseable range bounds are silently ignored.
 */
function buildFilters(
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
		out.clauses.push(dialect === "sqlite" ? `${col} = ${v ? 1 : 0}` : `${col} = ${v}`);
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

	// Matcher table from Queriable's inference — the `?param=` semantics.
	const fieldPlans = deriveFieldPlans(schema, { fields: options.fields });

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

	async function runList(c: Context, exec: SqlQueryExecutor): Promise<Response> {
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
					kinds.get(sortField) === "integer" || kinds.get(sortField) === "number";
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

	async function runById(c: Context, exec: SqlQueryExecutor): Promise<Response> {
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
		};
	};

	return Base;
}

export { Servable as default };
