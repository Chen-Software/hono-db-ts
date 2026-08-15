import { deriveSqlPlan } from "./sql-serialisable";
import type { JsonSchema } from "./sql-serialisable";

/**
 * What kind of query semantics a field supports. The {@link Queriable} capacity
 * INFERS most of these from the reflected schema (boolean → equality, number →
 * equality, date → range, array → comma-list "contains all", string/uuid →
 * substring). A `fields` override in the capacity options can change the default
 * (e.g. force a range, or expose an alias) — no per-field typia tag required.
 *
 *   - `"eq"`        — exact (case-insensitive for strings) equality (default for
 *                     boolean / number).
 *   - `"substring"` — case-insensitive `includes` (default for strings/uuid).
 *   - `"range"`     — "range-capable" field. A BARE value is an EXACT match
 *                     (day-level for dates, numeric-equality for numbers). Only
 *                     a value wrapped in `[` `]` is a TUPLE closed range
 *                     `[min,max]` (>= min AND <= max). This removes the
 *                     ambiguity of a bare comma: on the wire a comma is now a
 *                     literal value, never a range separator.
 *   - `"list"`      — comma LIST "must contain ALL" (default for array fields).
 *   - `"none"`      — field is NOT queryable (ignored like an unknown field).
 */
export type QueryableMode = "eq" | "substring" | "range" | "list" | "none";

/**
 * Queriable — a reusable capacity that turns ANY model into a queryable entity
 * with automatic, SCHEMA-INFERRED query-param semantics. It replaces the
 * hand-written `filterPosts` boilerplate: instead of a per-model predicate
 * function, `Queriable` reads the model's reflected schema (via the same
 * `deriveSqlPlan` bridge `SqlSerialisable` uses) and derives, per field, the
 * correct matcher. `Post` and `User` share the exact same code path.
 *
 * How the matcher for each field is decided (in priority order):
 *   1. A field-level override in the capacity options (`{ fields: { created_at:
 *      { mode: "range" } } }`) — e.g. force a range, or expose an alias.
 *   2. Inference from the reflected column `kind` / `format`:
 *        - boolean            → `eq`      (exact true/false)
 *        - number             → `range`   (bare = exact numeric; `[min,max]`
 *                                      TUPLE = closed numeric range)
 *        - date / date-time   → `range`   (bare = exact day-level match;
 *                                      `[min,max]` TUPLE = closed date range)
 *        - array              → `list`    (comma LIST, "contains ALL elements")
 *        - uuid / other str   → `substring` (case-insensitive `includes`)
 *        - plain string       → `substring` (case-insensitive `includes`)
 *
 * All matching is PERMISSIVE: an unknown param key, an empty value, an
 * unparseable range bound, or a field absent from an item is never an error —
 * the predicate simply passes (so extra/optional query params can't 400).
 *
 * The capacity never touches SQL or the transport layer; it filters an in-memory
 * array of model instances (the same contract `filterPosts` had), so it slots
 * straight into a controller:
 *
 * @example
 * const filtered = Post.filter(items, c.req.query());
 * const filtered = User.filter(items, c.req.query());
 */
export interface QueriableOptions {
	/** Per-field overrides, keyed by field name (or the `as` alias). */
	fields?: Record<string, { mode?: QueryableMode; as?: string }>;
}

/** The matcher each field resolves to. */
type Matcher = "eq" | "substring" | "range" | "list" | "none";

/**
 * One resolved queryable field: how the query-param `param` maps onto the
 * model field `field`, with the inferred matcher mode. Exported so sibling
 * capacities (e.g. `Servable`) can reuse `Queriable`'s schema-inferred
 * semantics to build SQL filters instead of re-deriving them.
 */
export interface FieldPlan {
	/** The field name on the model instance. */
	field: string;
	/** The query-param key (defaults to `field`; may be overridden via `as`). */
	param: string;
	mode: Matcher;
	/** Whether this field is a date (drives exact-match + range semantics). */
	isDate: boolean;
}

/**
 * Read per-field `format` from the raw reflected JSON schema (the same
 * `JsonSchema` `SqlSerialisable` consumes). `deriveSqlPlan` doesn't surface
 * `fmt` for every format, so we read `format` directly to detect dates
 * (`date-time`/`date`) and uuids — these drive the matcher inference. Handles
 * both a flat `format` and a `oneOf` of `format`s (typia emits uuid as a
 * oneOf of a pattern + a `format: "uuid"`).
 */
function collectFormats(schema: JsonSchema): Record<string, string> {
	const out: Record<string, string> = {};
	const doc = schema as any;
	const props = doc?.schema?.properties ?? doc?.properties ?? {};
	for (const [name, def] of Object.entries(props) as [string, any][]) {
		const fmt = def?.format;
		if (typeof fmt === "string") {
			out[name] = fmt;
			continue;
		}
		if (Array.isArray(def?.oneOf)) {
			for (const branch of def.oneOf) {
				if (typeof branch?.format === "string") {
					out[name] = branch.format;
					break;
				}
			}
		}
	}
	return out;
}

/**
 * Build the per-field matcher table for a model from its reflected schema,
 * applying option overrides on top of kind/format inference. Exported so
 * `Servable` (and other SQL translators) reuse the SAME inference `Queriable`
 * uses — a `?param=` means the same thing in-memory and over SQL.
 */
export function deriveFieldPlans(
	schema: JsonSchema,
	options: QueriableOptions = {},
): FieldPlan[] {
	const plan = deriveSqlPlan(schema, { name: "queriable", dialect: "sqlite" });
	const formats = collectFormats(schema);
	const overrides = options.fields ?? {};

	const plans: FieldPlan[] = [];
	for (const col of plan.columns) {
		let mode: Matcher = kindToMode(col.kind, formats[col.name]);
		const override = overrides[col.name];
		if (override?.mode) mode = override.mode;
		const isDate =
			formats[col.name] === "date-time" || formats[col.name] === "date";
		// The field is always queryable under its own name. An `as` override
		// ADDS an alias on top (it does not replace the field name), so both
		// `?email=` and `?mail=` work.
		plans.push({ field: col.name, param: col.name, mode, isDate });
		if (override?.as && override.as !== col.name) {
			plans.push({ field: col.name, param: override.as, mode, isDate });
		}
	}
	return plans;
}

/** Map a reflected column kind (+ format) to its default matcher. */
function kindToMode(kind: string, format?: string): Matcher {
	if (format === "date-time" || format === "date") return "range";
	if (format === "uuid") return "substring"; // prefix search, e.g. ?authorId=
	switch (kind) {
		case "boolean":
			return "eq";
		case "number":
		case "integer":
			return "range"; // bare = exact number; `[min,max]` = numeric range
		case "array":
			return "list";
		case "uuid":
			return "substring";
		case "string":
		default:
			return "substring";
	}
}

/** The `?param=` query shape every Queriable-style filter accepts. */
export type QueryParams = Record<string, string | string[] | undefined>;

/**
 * Apply a derived field-plan matcher table to an in-memory array — the shared
 * core of `Queriable.filter` AND `Aggregable`'s pre-aggregation narrowing.
 * PERMISSIVE like `Queriable`: an unknown param key, an empty value, an
 * unparseable range bound, or a field absent from an item is never an error —
 * the predicate simply passes. The `limit` param is IGNORED here (it is page
 * control, not a matcher); callers apply it themselves.
 */
export function filterByPlans<I extends object>(
	items: I[],
	query: QueryParams,
	fieldPlans: FieldPlan[],
): I[] {
	// Invert fieldPlans → param-keyed matcher for fast lookup.
	const byParam = new Map<string, FieldPlan>();
	for (const fp of fieldPlans) {
		if (fp.mode === "none") continue;
		byParam.set(fp.param, fp);
	}

	const predicates = Object.entries(query).filter(([key]) => key !== "limit");

	return items.filter((item) => {
		const data = item as unknown as Record<string, unknown>;
		return predicates.every(([key, raw]) => {
			const wanted = Array.isArray(raw) ? raw[0] : raw;
			if (wanted == null || wanted === "") return true;
			const fp = byParam.get(key);
			// Unknown param key (or a `none` field) → ignore.
			if (!fp) return true;
			const actual = data[fp.field];
			if (actual === undefined || actual === null) return true;
			return matchField(actual, wanted, fp.mode, fp.isDate);
		});
	});
}

/**
 * Queriable — the capacity factory. Wires a static `filter` onto the adorned
 * model that applies the derived matcher table to an array of instances.
 */
export const Queriable = <T extends object>(
	Base: new (...args: any[]) => T,
	_mod: unknown,
	options: QueriableOptions = {},
) => {
	// Cache the derived plan so it is computed once per model, not per call.
	const fieldPlans = deriveFieldPlans(
		(Base.prototype as any).schemaModule.schema as JsonSchema,
		options,
	);

		const QueriableClass = class QueriableClass extends Base {
		/** Apply the derived query matchers to `items`. */
		static filter<I extends T>(
			items: I[],
			query: QueryParams,
		): I[] {
			const limitRaw = query["limit"];
			const limit =
				limitRaw != null
					? Number(Array.isArray(limitRaw) ? limitRaw[0] : limitRaw)
					: undefined;

			const matched = filterByPlans(items, query, fieldPlans);
			return limit != null && Number.isFinite(limit)
				? matched.slice(0, Math.max(0, limit))
				: matched;
		}
	};

	// Lift the derived plans as a static so sibling capacities (notably
	// `Servable`) can reuse them as the SINGLE SOURCE OF TRUTH for `?param=`
	// semantics — an alias declared once on `Queriable` (e.g. `email` as
	// `?mail=`) is then automatically honored over SQL too, with no duplicate
	// `fields` override on `Servable`.
	(QueriableClass as unknown as { fieldPlans: FieldPlan[] }).fieldPlans =
		fieldPlans;

	return QueriableClass;
};

/** Apply a single field's matcher. `isDate` is only meaningful for `range`. */
function matchField(
	actual: unknown,
	wanted: string,
	mode: Matcher,
	isDate = false,
): boolean {
	switch (mode) {
		case "eq":
			return matchEq(actual, wanted);
		case "substring":
			return String(actual).toLowerCase().includes(wanted.toLowerCase());
		case "range":
			return matchRangeValue(actual, wanted, isDate);
		case "list":
			return matchList(actual, wanted);
		case "none":
		default:
			return true;
	}
}

/** Exact (case-insensitive for strings, numeric-coerced for numbers). */
function matchEq(actual: unknown, wanted: string): boolean {
	if (typeof actual === "boolean") return actual === (wanted === "true");
	if (typeof actual === "number")
		return actual === Number(wanted) && !Number.isNaN(Number(wanted));
	return String(actual).toLowerCase() === wanted.toLowerCase();
}

/**
 * Range-capable matcher. A BARE value is an EXACT match; only a value wrapped
 * in `[` `]` is parsed as a closed `[min,max]` tuple range. This keeps commas
 * on the wire unambiguous — a comma is a literal value, not a range separator
 * — so `?created_at=2000-01-01` is an exact single-day match while
 * `?created_at=[2000-01-01,2000-12-31]` is a range.
 */
function matchRangeValue(
	actual: unknown,
	wanted: string,
	isDate: boolean,
): boolean {
	const trimmed = wanted.trim();
	if (trimmed.startsWith("[") && trimmed.endsWith("]") && trimmed.length >= 2) {
		const inner = trimmed.slice(1, -1).trim();
		const parts = inner.split(",").map((s) => s.trim());
		// A tuple of two+ bounds → closed range; a single value in brackets is
		// an explicit exact match (e.g. to opt out of range on a date field).
		if (parts.length >= 2) {
			return isDate
				? matchDateRange(actual, parts.join(","))
				: matchNumericRange(actual, parts.join(","));
		}
		return matchExact(actual, parts[0] ?? "", isDate);
	}
	// No brackets → exact match (NOT a range, NOT substring).
	return matchExact(actual, wanted, isDate);
}

/** Closed `[min,max]` range for a DATE field (>= min AND <= max). */
function matchDateRange(actual: unknown, tuple: string): boolean {
	const parts = tuple.split(",").map((s) => s.trim());
	if (parts.length < 2) return matchExact(actual, tuple, true);
	const [minRaw, maxRaw] = parts;

	const actualDate = new Date(String(actual));
	if (Number.isNaN(actualDate.getTime())) return false;

	if (minRaw != null && minRaw !== "") {
		const min = new Date(minRaw);
		if (!Number.isNaN(min.getTime()) && actualDate < min) return false;
	}
	if (maxRaw != null && maxRaw !== "") {
		const max = new Date(maxRaw);
		if (!Number.isNaN(max.getTime()) && actualDate > max) return false;
	}
	return true;
}

/** Closed `[min,max]` range for a NUMERIC field (>= min AND <= max). */
function matchNumericRange(actual: unknown, tuple: string): boolean {
	const parts = tuple.split(",").map((s) => s.trim());
	if (parts.length < 2) return matchExact(actual, tuple, false);
	const [minRaw, maxRaw] = parts;

	if (typeof actual !== "number" && typeof actual !== "string") return false;
	const value = typeof actual === "number" ? actual : Number(actual);
	if (Number.isNaN(value)) return false;

	if (minRaw !== "") {
		const min = Number(minRaw);
		if (!Number.isNaN(min) && value < min) return false;
	}
	if (maxRaw !== "") {
		const max = Number(maxRaw);
		if (!Number.isNaN(max) && value > max) return false;
	}
	return true;
}

/** Exact match for a range-capable field: day-level for dates, equality otherwise. */
function matchExact(actual: unknown, wanted: string, isDate: boolean): boolean {
	if (isDate) {
		const ak = dateDayKey(actual);
		const wk = dateDayKey(wanted);
		if (ak != null && wk != null) return ak === wk;
	}
	return matchEq(actual, wanted);
}

/** UTC `YYYY-MM-DD` key for a date-ish value, or null if not parseable. */
function dateDayKey(value: unknown): string | null {
	const d = new Date(String(value));
	if (Number.isNaN(d.getTime())) return null;
	return d.toISOString().slice(0, 10);
}

/** Comma LIST — `actual` (array) must contain EVERY wanted element. */
function matchList(actual: unknown, wanted: string): boolean {
	const want = wanted.split(",").map((s) => s.trim().toLowerCase());
	const have = Array.isArray(actual)
		? actual.map((x) => String(x).toLowerCase())
		: [String(actual).toLowerCase()];
	return want.every((w) => have.includes(w));
}

export { Queriable as default };
