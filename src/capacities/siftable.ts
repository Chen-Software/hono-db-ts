import { deriveSqlPlan } from "./sql-serialisable";
import type { JsonSchema } from "./sql-serialisable";

/**
 * Siftable — keyset (cursor) pagination for a `Queriable` model.
 *
 * `Queriable` already gives you schema-inferred in-memory FILTERING
 * (`Repository.filter(items, query)`), but filtering alone returns the WHOLE
 * matching set. A forge list endpoint (repository index, issue list) needs
 * stable, efficient pagination over a large set — that is exactly what this
 * capacity adds: **filter, order, then walk by cursor**.
 *
 * Why keyset (cursor) pagination instead of `offset`?
 *   - offset re-scans and can skip/duplicate when rows are inserted between
 *     page fetches;
 *   - a keyset cursor ("fetch strictly after this value") is O(page), stable
 *     under concurrent writes, and matches SQL `WHERE sortKey > $cursor ORDER
 *     BY sortKey LIMIT $n`.
 *
 * The sort key defaults to `updated_at` descending — the natural "newest
 * first" ordering for repositories — and is configurable via the options.
 * The cursor is the sort-key VALUE of the last item seen, so it is opaque to
 * the caller yet sufficient to resume.
 *
 * Adds to the adorned class:
 *   static sift(items, query?, cursorOpts?) -> { rows, nextCursor }
 *
 * Semantics:
 *   - `items` is an in-memory array (the same contract as `Queriable.filter`);
 *   - `query` is the SAME query-param shape `Queriable` accepts, forwarded to
 *     `Queriable.filter` for narrowing before pagination;
 *   - `cursorOpts.limit` (default 25) bounds the page;
 *   - `cursorOpts.cursor` is the opaque sort-key value to resume strictly
 *     AFTER (a raw value, or `null`/omitted for the first page);
 *   - `cursorOpts.sort` picks the sort key + direction (default `updated_at`
 *     descending);
 *   - returns `{ rows, nextCursor }` where `nextCursor` is `null` when the
 *     returned page is the last one.
 *
 * It is PERMISSIVE like `Queriable`: an unknown `query` key, a missing sort
 * key on an item, or a non-string cursor are all tolerated (never thrown).
 */

/** Sort specification: a model field + ascending/descending direction. */
export interface SiftSort {
	/** Field to order by. Default `"updated_at"`. */
	field?: string;
	/** `"asc"` (oldest-first) or `"desc"` (newest-first, default). */
	dir?: "asc" | "desc";
}

export interface SiftOptions {
	/** Default sort when a call omits `cursorOpts.sort`. */
	sort?: SiftSort;
}

export interface SiftCursorOpts {
	/** Page size. Default 25. */
	limit?: number;
	/** Opaque sort-key value to resume strictly AFTER. `null` = first page. */
	cursor?: string | null;
	/** Per-call sort override. */
	sort?: SiftSort;
}

export interface SiftPage<I> {
	/** The page rows (already filtered + ordered + bounded by limit). */
	rows: I[];
	/** Opaque cursor for the NEXT page, or `null` when this is the last page. */
	nextCursor: string | null;
}

/** Read the `format` per field from the reflected schema (date detection). */
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

/** The set of fields present on the model's reflected schema. */
function schemaFields(schema: JsonSchema): Set<string> {
	const doc = schema as any;
	const props = doc?.schema?.properties ?? doc?.properties ?? {};
	return new Set(Object.keys(props));
}

/**
 * Order a set by the given sort. Uses a raw value comparison — ISO-8601
 * date-time strings sort lexicographically, numbers compare numerically, and
 * anything else falls back to `String()` comparison. Missing values sort
 * LAST regardless of direction (so they never dangle in the middle of a page).
 */
function sortRows<I>(rows: I[], sort: Required<SiftSort>): I[] {
	const { field, dir } = sort;
	const dirN = dir === "asc" ? 1 : -1;
	return [...rows].sort((a, b) => {
		const av = (a as any)?.[field];
		const bv = (b as any)?.[field];
		const aMissing = av == null;
		const bMissing = bv == null;
		if (aMissing && bMissing) return 0;
		if (aMissing) return 1; // missing sorts last
		if (bMissing) return -1;
		if (typeof av === "number" && typeof bv === "number") {
			return (av - bv) * dirN;
		}
		return String(av).localeCompare(String(bv)) * dirN;
	});
}

/**
 * Resume strictly AFTER the cursor value. The cursor is the sort-key value of
 * the last item on the previous page, so "next page" = items whose sort key is
 * strictly past it (in the sort direction). Equal keys are a tie — we cannot
 * disambiguate without a secondary key, so we keep ALL items that tie with the
 * cursor (they would otherwise be skipped). This is the documented trade-off
 * of a single-key keyset cursor; a composite cursor is a later refinement.
 */
function afterCursor<I>(
	rows: I[],
	field: string,
	dir: "asc" | "desc",
	cursor: string,
): I[] {
	const dirN = dir === "asc" ? 1 : -1;
	return rows.filter((row) => {
		const v = (row as any)?.[field];
		if (v == null) return false;
		const cmp =
			typeof v === "number" && /^-?\d/.test(cursor)
				? v - Number(cursor)
				: String(v).localeCompare(cursor);
		// "Past the cursor in sort order": for desc (bigger first) that means
		// strictly smaller values (cmp < 0); for asc (smaller first) it means
		// strictly larger values (cmp > 0). Equal values are EXCLUDED (strict)
		// so they don't re-appear on the next page — the documented single-key
		// keyset trade-off (ties could be skipped if they straddle a page).
		return dirN * cmp > 0;
	});
}

export function Siftable<TBase extends new (...args: any[]) => any>(
	Base: TBase,
	_mod?: any,
	options: SiftOptions = {},
): TBase {
	Base.prototype.capacities && Base.prototype.addCapacity?.("Siftable");

	const schema = (Base.prototype as any).schemaModule.schema as JsonSchema;
	const fields = schemaFields(schema);
	const formats = collectFormats(schema);
	const defaultSort: Required<SiftSort> = {
		field: options.sort?.field ?? "updated_at",
		dir: options.sort?.dir ?? "desc",
	};

	const SiftableClass = class SiftableClass extends (Base as any) {
		/**
		 * Filter (`Queriable`-style), order, and paginate by cursor.
		 *
		 * @param items        the in-memory set to page over
		 * @param query        optional `Queriable` query-param narrowing
		 * @param cursorOpts   `{ limit, cursor, sort }` — see {@link SiftCursorOpts}
		 */
		static sift<I extends object>(
			items: I[],
			query: Record<string, string | string[] | undefined> = {},
			cursorOpts: SiftCursorOpts = {},
		): SiftPage<I> {
			const limit = Math.max(1, cursorOpts.limit ?? 25);
			const sort: Required<SiftSort> = {
				field: cursorOpts.sort?.field ?? defaultSort.field,
				dir: cursorOpts.sort?.dir ?? defaultSort.dir,
			};
			const { field, dir } = sort;

			// 1. Narrow with the same query semantics as Queriable (when present).
			let rows: I[] = items;
			const filter = (Base as any).filter;
			if (typeof filter === "function" && Object.keys(query).length > 0) {
				rows = filter(items, query);
			}

			// 2. Order by the sort key.
			rows = sortRows(rows, sort);

			// 3. Resume strictly after the cursor (when given).
			const cursor = cursorOpts.cursor;
			if (cursor != null && cursor !== "") {
				rows = afterCursor(rows, field, dir, cursor);
			}

			// 4. Take the page, and derive the next cursor from the LAST row.
			const page = rows.slice(0, limit);
			let nextCursor: string | null = null;
			if (page.length === limit && rows.length > limit) {
				const last = page[page.length - 1];
				const v = (last as any)?.[field];
				// Only emit a cursor when the last row actually has a usable key.
				nextCursor = v == null ? null : String(v);
			}

			return { rows: page, nextCursor };
		}
	};

	return SiftableClass as unknown as TBase;
}

export { Siftable as default };
