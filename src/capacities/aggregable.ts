/**
 * Aggregable — a reusable capacity that turns ANY `SqlSerialisable` model into
 * an aggregateable entity: `GROUP BY` + `COUNT` / `SUM` / `AVG` / `MIN` / `MAX`
 * over the reflected schema, queried through the same `?param=` surface the
 * rest of the architecture uses.
 *
 * It answers the "ranking / roll-up" questions the row-filtering capacities
 * (`Queriable` / `Siftable` / `Servable`) cannot — those only say WHICH rows
 * match; `Aggregable` says what the matching rows ADD UP to:
 *
 *   - "which users own the most repositories?"  → GET /repositories/aggregate?groupBy=ownerId&count=*&orderBy=count:desc
 *   - "average age per role?"         → GET /users/aggregate?groupBy=role&avg=age
 *   - "average stars per repository?" → GET /repositories/aggregate?groupBy=ownerId&avg=numStars
 *
 * Two surfaces, ONE query shape (so in-memory and SQL agree by construction):
 *
 *   1. IN-MEMORY — `Model.aggregate(items, query)` groups an array of
 *      instances (the same contract `Queriable.filter` has).
 *   2. SQL — `Model.serveAggregate(app, client)` registers `GET /<path>`
 *      (default `/<tableName>/aggregate`) and translates the SAME query params
 *      into a `SELECT … GROUP BY …` statement.
 *
 * Query params (all optional):
 *   - `groupBy`  — comma-separated field names to group by. Omitted → a single
 *                  whole-set row (like SQL without GROUP BY).
 *   - `count`    — `*` → `COUNT(*)` (alias `count`); `count=field` →
 *                  `COUNT(field)` (alias `count_field`). Comma-separated for
 *                  several counters.
 *   - `sum` / `avg` / `min` / `max` — comma-separated field names → aliases
 *                  `sum_field` / `avg_field` / `min_field` / `max_field`.
 *   - any OTHER param — a `Queriable`-style row filter applied BEFORE grouping
 *                  (boolean → eq, date → `[min,max]` range, string/uuid →
 *                  substring, …), using the SAME matcher table (`buildFilters`
 *                  on SQL) the list routes use.
 *   - `orderBy`  — comma-separated `<alias>[:asc|desc]` where `<alias>` is a
 *                  group field or an aggregate alias (e.g. `count:desc`).
 *                  Default: first `groupBy` field ascending (stable).
 *   - `limit`    — cap the number of group rows (default 25, max 100).
 *
 * When neither `groupBy` nor any aggregate is given, it degrades to a row
 * count of the filtered set (`[{ count: N }]`) — mirroring the CLI `--count`.
 *
 * PERMISSIVE like `Queriable`: unknown `groupBy`/aggregate fields and unknown
 * `orderBy` aliases are silently dropped; unknown filter params pass; empty
 * values are ignored. Never 400s on a bad param.
 *
 * Aggregate rows are PLAIN data (group field values + aggregate aliases) —
 * they are not domain entities, so no `fromRow` decoding applies.
 *
 * Composition: requires `SqlSerialisable` to be declared BEFORE `Aggregable`
 * (it lifts `table` / the column kinds the SQL route reads), exactly like
 * `Servable`.
 *
 * @example
 * const app = new Hono();
 * Repository.serveAggregate(app, client);   // GET /repositories/aggregate
 *
 * const rows = Repository.aggregate(allRepos, {
 *   groupBy: "ownerId", count: "*", orderBy: "count:desc",
 * });                                       // [{ ownerId, count }, …] most-repos first
 */

import { getTableName } from "drizzle-orm";
import type { Context, Hono } from "hono";
import type { CapacityComposer, ComposeContext } from "./compose";
import {
	deriveFieldPlans,
	type FieldPlan,
	filterByPlans,
	type QueriableOptions,
	type QueryParams,
} from "./queriable";
import { buildFilters } from "./servable";
import {
	deriveSqlPlan,
	type JsonSchema,
	type SqlDialect,
} from "./sql-serialisable";
import { all, type Db } from "@/services/types";

/** Options for the {@link Aggregable} capacity. */
export interface AggregableOptions {
	/** Route base path. Default `/<tableName>/aggregate`. */
	path?: string;
	/** Default SQL client used by `serveAggregate(app)` when the caller omits one. */
	client?: Db;
	/** Per-field matcher overrides — the EXACT `Queriable` option shape. */
	fields?: QueriableOptions["fields"];
	/** Dialect the SQL targets. Default `"sqlite"` (must match `SqlSerialisable`). */
	dialect?: SqlDialect;
	/** Default number of group rows. Default 25. */
	defaultLimit?: number;
	/** Hard cap on group rows. Default 100. */
	maxLimit?: number;
}

/** The static API {@link Aggregable} contributes to the adorned class. */
export interface AggregableStatic {
	/** Group + aggregate an in-memory array; returns plain aggregate rows. */
	aggregate<I extends object>(
		items: I[],
		query?: QueryParams,
	): Array<Record<string, unknown>>;
	/** Register `GET <path>` (SQL `GROUP BY`) onto a Hono app. */
	serveAggregate(app: Hono, client?: Db): void;
	/** Introspect the generated route: path, groupable fields, aggregates. */
	aggregateSpec(): AggregableSpec;
}

/** Introspection surface `aggregateSpec()` returns. */
export interface AggregableSpec {
	path: string;
	table: string;
	dialect: SqlDialect;
	/** Fields usable as `groupBy` + as filter params (the `Queriable` plans). */
	fields: Array<{
		field: string;
		param: string;
		mode: string;
		isDate: boolean;
	}>;
	/** Which aggregate functions accept which fields (`"*"` = COUNT(*)). */
	aggregates: {
		count: string[];
		sum: string[];
		avg: string[];
		min: string[];
		max: string[];
	};
	limit: { default: number; max: number };
}

/** Query params `Aggregable` claims for itself (everything else is a filter). */
const CONTROL = new Set([
	"groupBy",
	"count",
	"sum",
	"avg",
	"min",
	"max",
	"orderBy",
	"limit",
]);

/** One parsed aggregate spec: `COUNT(*)`, `SUM(age)`, … */
interface ParsedAgg {
	fn: "count" | "sum" | "avg" | "min" | "max";
	/** `null` only for `COUNT(*)`. */
	field: string | null;
	alias: string;
}

/** `count=*` → `count`; `count=authorId` → `count_authorId`. */
function countAlias(field: string | null): string {
	return field == null ? "count" : `count_${field}`;
}

/** `sum=age` → `sum_age`, etc. */
function aggAlias(fn: string, field: string): string {
	return `${fn}_${field}`;
}

/** Parse the aggregate params (`count` / `sum` / `avg` / `min` / `max`). */
function parseAggregates(query: QueryParams): ParsedAgg[] {
	const out: ParsedAgg[] = [];
	const take = (fn: ParsedAgg["fn"]) => {
		const raw = query[fn];
		if (raw == null || raw === "") return;
		const vals = String(Array.isArray(raw) ? raw[0] : raw)
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		for (const v of vals) {
			if (fn === "count" && (v === "*" || v === "count")) {
				out.push({ fn, field: null, alias: countAlias(null) });
			} else {
				out.push({ fn, field: v, alias: aggAlias(fn, v) });
			}
		}
	};
	take("count");
	take("sum");
	take("avg");
	take("min");
	take("max");
	return out;
}

/** Coerce a value to a number for SUM/AVG (booleans → 0/1; null on failure). */
function numValue(v: unknown): number | null {
	if (typeof v === "number") return Number.isFinite(v) ? v : null;
	if (typeof v === "boolean") return v ? 1 : 0;
	if (typeof v === "string" && v.trim() !== "") {
		const n = Number(v);
		return Number.isNaN(n) ? null : n;
	}
	return null;
}

/** Total order for MIN/MAX (numeric when both are, string compare otherwise). */
function cmp(a: unknown, b: unknown): number {
	const an = numValue(a);
	const bn = numValue(b);
	if (an != null && bn != null) return an - bn;
	return String(a).localeCompare(String(b));
}

/** Compute one aggregate over a group's rows. */
function computeAgg(rows: Record<string, unknown>[], a: ParsedAgg): unknown {
	const field = a.field as string;
	switch (a.fn) {
		case "count":
			if (a.field == null) return rows.length;
			return rows.filter((r) => r[field] != null).length;
		case "sum":
		case "avg": {
			let sum = 0;
			let n = 0;
			for (const r of rows) {
				const v = numValue(r[field]);
				if (v != null) {
					sum += v;
					n++;
				}
			}
			// Mirror SQL: SUM/AVG over no numeric values is NULL, not 0.
			if (n === 0) return null;
			return a.fn === "avg" ? sum / n : sum;
		}
		case "min":
		case "max": {
			let best: unknown;
			for (const r of rows) {
				const v = r[field];
				if (v == null) continue;
				// First value seeds the result — `cmp(v, undefined)` is not
				// meaningful, so seed before comparing.
				if (best === undefined) {
					best = v;
					continue;
				}
				const better = a.fn === "min" ? cmp(v, best) < 0 : cmp(v, best) > 0;
				if (better) best = v;
			}
			return best ?? null;
		}
	}
}

/** Group rows by `groupFields` and apply the aggregate specs. */
function groupRows(
	items: Record<string, unknown>[],
	groupFields: string[],
	aggs: ParsedAgg[],
): Array<Record<string, unknown>> {
	const groups = new Map<string, Record<string, unknown>[]>();
	for (const item of items) {
		const key = JSON.stringify(groupFields.map((f) => item[f]));
		const arr = groups.get(key) ?? [];
		arr.push(item);
		groups.set(key, arr);
	}

	const out: Array<Record<string, unknown>> = [];
	for (const rows of groups.values()) {
		const row: Record<string, unknown> = {};
		for (const f of groupFields) row[f] = rows[0][f];
		for (const a of aggs) row[a.alias] = computeAgg(rows, a);
		out.push(row);
	}
	return out;
}

/** One `orderBy` term: `<alias>[:asc|desc]`. */
interface OrderSpec {
	col: string;
	dir: "asc" | "desc";
}

/**
 * Parse `orderBy` (comma-separated `<alias>[:asc|desc]`). Aliases not in
 * `known` are silently dropped (permissive); default direction is `desc` —
 * the same "biggest/newest first" default the rest of the architecture uses.
 */
function parseOrderBy(query: QueryParams, known: Set<string>): OrderSpec[] {
	const raw = query.orderBy;
	if (raw == null || raw === "") return [];
	const specs: OrderSpec[] = [];
	for (const part of String(Array.isArray(raw) ? raw[0] : raw).split(",")) {
		const p = part.trim();
		if (!p) continue;
		const [col, dirRaw] = p.split(":");
		if (col && known.has(col))
			specs.push({ col, dir: dirRaw === "asc" ? "asc" : "desc" });
	}
	return specs;
}

/** Stable sort of aggregate rows by the order specs. */
function sortRows(
	rows: Array<Record<string, unknown>>,
	order: OrderSpec[],
): Array<Record<string, unknown>> {
	if (order.length === 0) return rows;
	return [...rows].sort((a, b) => {
		for (const o of order) {
			const c = cmp(a[o.col], b[o.col]) * (o.dir === "asc" ? 1 : -1);
			if (c !== 0) return c;
		}
		return 0;
	});
}

/** Parse + clamp a `?limit=` value to `[1, max]` (mirrors `Servable`). */
function parseLimit(
	raw: string | string[] | undefined,
	def: number,
	max: number,
): number {
	if (raw == null || raw === "") return def;
	const n = Number.parseInt(String(Array.isArray(raw) ? raw[0] : raw), 10);
	if (!Number.isFinite(n)) return def;
	return Math.min(Math.max(1, n), max);
}

/** Quote a SQL identifier (table/column name). */
function quote(id: string): string {
	return `"${id.replace(/"/g, '""')}"`;
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

// ---------------------------------------------------------------------------
// Capacity section.
// ---------------------------------------------------------------------------

export function Aggregable<TBase extends CapacityComposer>(
	Base: TBase,
	_mod?: unknown,
	options: AggregableOptions = {},
	_ctx?: ComposeContext,
): TBase {
	Base.prototype.capacities && Base.prototype.addCapacity?.("Aggregable");

	const schema = (Base.prototype as any).schemaModule?.schema as
		| JsonSchema
		| undefined;
	if (!schema) {
		throw new Error(
			"Aggregable: model has no reflected schema (schemaModule.schema) — " +
				"compose Triggerable first.",
		);
	}

	const table = (Base as any).table;
	if (!table) {
		throw new Error(
			"Aggregable: model has no derived drizzle `table` — compose " +
				"SqlSerialisable BEFORE Aggregable.",
		);
	}

	const tableName = getTableName(table as any);
	const dialect = options.dialect ?? "sqlite";

	// Column kinds + primary key from the SAME plan SqlSerialisable derives
	// (needed by `buildFilters`, which reuses `Servable`'s exact WHERE builder).
	const plan = deriveSqlPlan(schema, { name: tableName, dialect });
	const kinds = new Map<string, string>();
	for (const col of plan.columns) kinds.set(col.name, col.kind);

	// Matcher table from Queriable's inference — the `?param=` semantics. When
	// `Queriable` is ALSO composed, reuse its LIFTED plans (the single source of
	// truth for field aliases like `?mail=` — a `fields` override declared once
	// on `Queriable` is honored here automatically); fall back to deriving from
	// `options.fields` only when `Queriable` was NOT composed.
	const inheritedPlans = (Base as any).fieldPlans as FieldPlan[] | undefined;
	const fieldPlans =
		inheritedPlans && inheritedPlans.length > 0
			? inheritedPlans
			: deriveFieldPlans(schema, { fields: options.fields });
	const fieldSet = new Set(fieldPlans.map((fp) => fp.field));
	// Numeric fields are the valid SUM/AVG/MIN/MAX targets.
	const numericFields = plan.columns
		.filter((c) => c.kind === "integer" || c.kind === "number")
		.map((c) => c.name);

	const basePath = options.path ?? `/${tableName}/aggregate`;
	const defaultLimit = options.defaultLimit ?? 25;
	const maxLimit = options.maxLimit ?? 100;

	/** Drop unknown group/aggregate fields (permissive — never 400). */
	function validateGroupFields(raw: string | string[] | undefined): string[] {
		return String(Array.isArray(raw) ? raw[0] : (raw ?? ""))
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean)
			.filter((f) => fieldSet.has(f));
	}
	function validateAggs(query: QueryParams): ParsedAgg[] {
		return parseAggregates(query).filter(
			(a) => a.field == null || fieldSet.has(a.field),
		);
	}

	// ---- IN-MEMORY surface ------------------------------------------------
	(Base as any).aggregate = function aggregate<I extends object>(
		items: I[],
		query: QueryParams = {},
	): Array<Record<string, unknown>> {
		const groupFields = validateGroupFields(query["groupBy"]);
		const aggs = validateAggs(query);

		// 1. Narrow with the SAME matcher semantics as Queriable.
		const filtered = filterByPlans(items, query, fieldPlans) as Record<
			string,
			unknown
		>[];

		// 2. Group + aggregate. No groupBy AND no aggregates → a row count.
		const usedAggs =
			aggs.length > 0
				? aggs
				: [{ fn: "count", field: null, alias: countAlias(null) } as ParsedAgg];
		let rows = groupRows(filtered, groupFields, usedAggs);

		// 3. Order: explicit `orderBy`, else first group field ascending.
		const known = new Set<string>([
			...groupFields,
			...usedAggs.map((a) => a.alias),
		]);
		let order = parseOrderBy(query, known);
		if (order.length === 0 && groupFields.length > 0) {
			order = [{ col: groupFields[0], dir: "asc" }];
		}
		rows = sortRows(rows, order);

		// 4. Limit.
		return rows.slice(0, parseLimit(query["limit"], defaultLimit, maxLimit));
	};

	// ---- SQL surface ------------------------------------------------------
	async function runAggregate(
		c: Context,
		exec: Db,
	): Promise<Response> {
		try {
			const query = c.req.query();
			const groupFields = validateGroupFields(query["groupBy"]);
			const aggs = validateAggs(query);

			// WHERE: the SAME `buildFilters` `Servable` uses — a `?param=`
			// filter means the same thing on the list route and here.
			const filters = buildFilters(query, fieldPlans, kinds, dialect);
			const where = filters.clauses;
			const params: unknown[] = [...filters.params];

			const usedAggs =
				aggs.length > 0
					? aggs
					: [
							{
								fn: "count",
								field: null,
								alias: countAlias(null),
							} as ParsedAgg,
						];
			const select: string[] = [
				...groupFields.map((f) => quote(f)),
				...usedAggs.map((a) => {
					const arg = a.field == null ? "*" : quote(a.field);
					return `${a.fn.toUpperCase()}(${arg}) AS ${quote(a.alias)}`;
				}),
			];

			const groupClause = groupFields.length
				? ` GROUP BY ${groupFields.map((f) => quote(f)).join(", ")}`
				: "";

			// ORDER BY against emitted aliases (validated — never raw input).
			const known = new Set<string>([
				...groupFields,
				...usedAggs.map((a) => a.alias),
			]);
			let order = parseOrderBy(query, known);
			if (order.length === 0 && groupFields.length > 0) {
				order = [{ col: groupFields[0], dir: "asc" }];
			}
			const orderClause = order.length
				? ` ORDER BY ${order
						.map((o) => `${quote(o.col)} ${o.dir === "asc" ? "ASC" : "DESC"}`)
						.join(", ")}`
				: "";

			const limit = parseLimit(query["limit"], defaultLimit, maxLimit);
			params.push(limit);

			const sql =
				`SELECT ${select.join(", ")} FROM ${quote(tableName)}` +
				(where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "") +
				groupClause +
				orderClause +
				` LIMIT ?`;

			const rows = (await all(exec,sql, params)) as Record<
				string,
				unknown
			>[];
			return json(rows);
		} catch (err) {
			return fail(`aggregable ${basePath}: ${(err as Error).message}`, 500);
		}
	}

	(Base as any).serveAggregate = function serveAggregate(
		app: Hono,
		client?: Db,
	): void {
		const exec = client ?? options.client;
		if (!exec) {
			throw new Error(
				`Aggregable: no SQL client for ${basePath} — pass one to ` +
					`serveAggregate(app, client) or set options.client at compose time.`,
			);
		}
		app.get(basePath, (c) => runAggregate(c, exec));
	};

	// ---- Introspection ----------------------------------------------------
	(Base as any).aggregateSpec = function aggregateSpec(): AggregableSpec {
		return {
			path: basePath,
			table: tableName,
			dialect,
			fields: fieldPlans.map((fp) => ({
				field: fp.field,
				param: fp.param,
				mode: fp.mode,
				isDate: fp.isDate,
			})),
			aggregates: {
				count: ["*", ...fieldPlans.map((fp) => fp.field)],
				sum: [...numericFields],
				avg: [...numericFields],
				min: [...numericFields],
				max: [...numericFields],
			},
			limit: { default: defaultLimit, max: maxLimit },
		};
	};

	return Base;
}

export { Aggregable as default };
