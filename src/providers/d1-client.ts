import { Database } from "bun:sqlite";

// ---------------------------------------------------------------------------
// Internal types (non-exported — must precede exports for biome useExportsLast)
// ---------------------------------------------------------------------------

// Co-variant flip: we accept the wider stream as the return.
interface RawD1Response extends Array<unknown> {}

// ---------------------------------------------------------------------------
// Internal prepared-statement wrapper
// ---------------------------------------------------------------------------

class LocalD1PreparedStatement {
	private sql: string;
	private params: unknown[];
	private db: Database;

	constructor(db: Database, sql: string, params: unknown[] = []) {
		this.db = db;
		this.sql = sql;
		this.params = params;
	}

	bind(...values: unknown[]): D1PreparedStatement {
		return new LocalD1PreparedStatement(this.db, this.sql, values);
	}

	async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
		return this.measure(() => {
			const stmt = this.db.prepare(this.sql);
			const results = (
				this.params.length > 0
					? stmt.all(...(this.params as [never]))
					: stmt.all()
			) as T[];
			return { rows: results, written: 0, lastId: 0 };
		});
	}

	async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
		return this.measure(() => {
			const runResult = this.db.run(
				this.sql,
				...(this.params as [never]),
			);
			return {
				rows: [] as T[],
				written: runResult.changes ?? 0,
				lastId: Number(runResult.lastInsertRowid ?? 0),
			};
		});
	}

	async raw<T extends unknown[]>(): Promise<T> {
		const stmt = this.db.prepare(this.sql);
		// bun:sqlite .values() returns Array<Array<unknown>>
		const rows = (
			this.params.length > 0
				? stmt.values(...(this.params as [never]))
				: stmt.values()
		) as T;
		return rows;
	}

	async first<T = Record<string, unknown>>(
		col?: string,
	): Promise<T | null> {
		const stmt = this.db.prepare(this.sql);
		const row = (
			this.params.length > 0
				? stmt.get(...(this.params as [never]))
				: stmt.get()
		) as T | undefined;
		if (!row) return null;
		if (col) return (row as Record<string, unknown>)[col] as T | null;
		return row;
	}

	/**
	 * Called by `LocalD1Database.batch` when wrapped in a transaction.
	 * Synchronous version — bun:sqlite runs are sync inside a transaction.
	 */
	execSync(): D1Result {
		const start = performance.now();
		const runResult = this.db.run(
			this.sql,
			...(this.params as [never]),
		);
		const duration = performance.now() - start;
		return {
			results: [],
			success: true,
			meta: {
				duration,
				last_row_id: Number(runResult.lastInsertRowid ?? 0),
				rows_read: 0,
				rows_written: runResult.changes ?? 0,
			},
		};
	}

	private measure<T>(
		fn: () => { rows: T[]; written: number; lastId: number },
	): D1Result<T> {
		const start = performance.now();
		const { rows, written, lastId } = fn();
		const duration = performance.now() - start;
		return {
			results: rows,
			success: true,
			meta: {
				duration,
				last_row_id: lastId,
				rows_read: rows.length,
				rows_written: written,
			},
		};
	}
}

// ---------------------------------------------------------------------------
// Minimal D1 types — a structural subset of `@cloudflare/workers-types`
// `D1Database` / `D1PreparedStatement`.  Only the shape drizzle-orm/d1
// actually calls is represented; the rest can be ignored.
// ---------------------------------------------------------------------------

export interface D1ResultMeta {
	duration: number;
	last_row_id: number;
	rows_read: number;
	rows_written: number;
}

export interface D1Result<T = Record<string, unknown>> {
	results: T[];
	success: boolean;
	meta: D1ResultMeta;
}

export interface D1PreparedStatement {
	bind(...values: unknown[]): D1PreparedStatement;
	all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
	run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
	raw<T = RawD1Response>(): Promise<T>;
	first<T = Record<string, unknown>>(col?: string): Promise<T | null>;
}

/**
 * `LocalD1Database` — local D1 emulation over `bun:sqlite`.
 *
 * Implements the subset of the Cloudflare D1 API surface that `drizzle-orm/d1`
 * actually calls: `prepare` → (`bind` →) `all` / `run` / `raw` / `first`,
 * plus `batch` and `exec`.
 *
 * In production a real `D1Database` is injected by the Workers runtime via
 * `env.DB`.  For local dev and smoke tests, instantiate this adapter and pass
 * it straight into `drizzle(d1Db)` from `drizzle-orm/d1` — the API surface is
 * identical.
 *
 * Usage:
 *   const d1 = new LocalD1Database(":memory:");  // or pass a file path
 *   await d1.exec("CREATE TABLE ...");
 *   const db = drizzle(d1);
 */
export class LocalD1Database {
	private db: Database;

	constructor(path: string | ":memory:") {
		this.db = new Database(path === ":memory:" ? ":memory:" : path, {
			create: true,
		});
		// WAL gives better concurrency when multiple handles touch the same file.
		this.db.run("PRAGMA journal_mode=WAL");
		this.db.run("PRAGMA foreign_keys=ON");
	}

	// ---- Statement API (used by drizzle) ----------------------------------

	prepare(sql: string): D1PreparedStatement {
		return new LocalD1PreparedStatement(this.db, sql);
	}

	// ---- Batch API --------------------------------------------------------

	async batch<T = Record<string, unknown>>(
		stmts: D1PreparedStatement[],
	): Promise<D1Result<T>[]> {
		const txn = this.db.transaction(() =>
			stmts.map((s) => {
				const inner = s as unknown as LocalD1PreparedStatement;
				return inner.execSync() as D1Result<T>;
			}),
		);
		return txn();
	}

	// ---- Exec (raw DDL / PRAGMAs) -----------------------------------------

	async exec(sql: string): Promise<D1Result> {
		this.db.run(sql);
		return {
			results: [],
			success: true,
			meta: { duration: 0, last_row_id: 0, rows_read: 0, rows_written: 0 },
		};
	}
}
