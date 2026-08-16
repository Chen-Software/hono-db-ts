import { SQL } from "bun";

import { databaseUrl } from "@/macros/envs" with { type: "macro" };

/**
 * `query <table> [jsonFilter] [flags]` — query a BBS model table via
 * `drizzle-orm/bun-sql` + the `databaseUrl()` macro (the Bun + Drizzle client
 * pattern: `new SQL(url)` → `drizzle({ client })`, exactly as the app does).
 *
 * `<table>` is a model/table name (e.g. `users`, `UserSchema`, `repositories`,
 * `RepositorySchema`) resolved through the model registry.
 *
 * The filter is a JSON object with per-column matchers:
 *   - equality:      `{"role": "admin"}`
 *   - comparisons:   `{"age": {">": 30}}`, `{"updated_at": {">=": "2026-01-01"}}`
 *   - string search: `{"title": {"contains": "hello"}}` (LIKE), `{"title": {"startsWith": "x"}}`
 *   - multiple keys are ANDed. Booleans (`"true"`/`"false"`) are coerced to the
 *     column's storage type (SQLite stores bools as 0/1) automatically.
 *
 * Flags:
 *   --limit N         cap the result set (default 50)
 *   --sort f[:asc|desc]  order by a column (default `updated_at` desc when present)
 *   --count           return only the matching row count
 *
 * Examples:
 *   cli query users '{"role": "admin"}'
 *   cli query repositories '{"isPrivate": "false"}' --sort numStars:desc --limit 20
 *   cli query users '{"name": {"contains": "a"}}' --sort created_at:asc
 */
export async function runQuery(args: string[]): Promise<void> {
	const tableArg = args[0];
	if (!tableArg) {
		console.error(
			"Error: query requires a <table> name. Known tables: users, repositories.",
		);
		process.exit(1);
	}

	// Import the models (runs the typia transform + SqlSerialisable) so the
	// registry is populated and every `.table` is derived.
	await import("@/models/user");
	await import("@/models/repository");

	const { drizzle } = await import("drizzle-orm/bun-sql");
	const { listModels } = await import("@/registry");

	// `databaseUrl()` is a build-time macro imported at the top of this module,
	// so it is inlined from `process.env` at startup (see macros/envs.ts).
	const url = databaseUrl();
	if (!url) {
		console.error(
			"Error: query needs DATABASE_URL (or TURSO_URL). Set it in .env or the shell.",
		);
		process.exit(1);
	}

	// Resolve the table: exact schemaName/table-name match, then case-insensitive
	// match on the derived drizzle table name.
	let target: any;
	for (const [, Ctor] of listModels()) {
		const tableName = Ctor.table?.[Symbol.for("drizzle:Name")];
		if (
			Ctor.schemaName === tableArg ||
			tableName === tableArg ||
			tableName?.toLowerCase() === tableArg.toLowerCase()
		) {
			target = Ctor.table;
			break;
		}
	}
	if (!target) {
		const known = listModels()
			.map(
				([, c]) => `${c.schemaName}(${c.table?.[Symbol.for("drizzle:Name")]})`,
			)
			.join(", ");
		console.error(
			`Error: unknown table "${tableArg}". Known models: ${known || "(none)"}`,
		);
		process.exit(1);
	}

	// ------------------------------------------------------------------
	// Parse flags + the (optional) filter JSON.
	// ------------------------------------------------------------------
	let filter: Record<string, unknown> = {};
	let limit = 50;
	let sort: { field: string; dir: "asc" | "desc" } | null = null;
	let doCount = false;

	const rest = args.slice(1);
	for (let i = 0; i < rest.length; i++) {
		const a = rest[i]!;
		if (a === "--limit") {
			limit = Math.max(1, Number(rest[i + 1]) || 50);
			i++;
		} else if (a === "--sort") {
			const spec = rest[i + 1];
			i++;
			if (spec) {
				const [field, dir] = spec.split(":");
				sort = { field: field!, dir: dir === "asc" ? "asc" : "desc" };
			}
		} else if (a === "--count") {
			doCount = true;
		} else if (a.startsWith("{")) {
			try {
				filter = JSON.parse(a) as Record<string, unknown>;
			} catch {
				console.error(`Error: filter is not valid JSON: "${a}"`);
				process.exit(1);
			}
		}
	}

	// ------------------------------------------------------------------
	// Build the WHERE clause.
	// ------------------------------------------------------------------
	const { eq, ne, gt, gte, lt, lte, like, and, desc, asc } = await import(
		"drizzle-orm"
	);
	const cols: Record<string, any> = target[Symbol.for("drizzle:Columns")];

	/** Coerce a boolean/boolean-string to its int storage (SQLite bools → 0/1). */
	function coerce(value: unknown): unknown {
		if (typeof value === "boolean") return value ? 1 : 0;
		if (
			value === "true" ||
			value === "false" ||
			value === "True" ||
			value === "False"
		) {
			return value === "true" || value === "True" ? 1 : 0;
		}
		return value;
	}

	const conditions: any[] = [];
	for (const [key, value] of Object.entries(filter)) {
		const col = cols[key];
		if (!col) {
			console.error(`Error: unknown column "${key}" on table "${tableArg}"`);
			process.exit(1);
		}
		if (value && typeof value === "object" && !Array.isArray(value)) {
			// Operator object, e.g. {">": 30}, {"contains": "x"}.
			const ops = value as Record<string, unknown>;
			for (const [op, operand] of Object.entries(ops)) {
				switch (op) {
					case "eq":
						conditions.push(eq(col, coerce(operand)));
						break;
					case "ne":
						conditions.push(ne(col, coerce(operand)));
						break;
					case ">":
						conditions.push(gt(col, coerce(operand)));
						break;
					case ">=":
						conditions.push(gte(col, coerce(operand)));
						break;
					case "<":
						conditions.push(lt(col, coerce(operand)));
						break;
					case "<=":
						conditions.push(lte(col, coerce(operand)));
						break;
					case "contains":
						conditions.push(like(col, `%${operand}%`));
						break;
					case "startsWith":
						conditions.push(like(col, `${operand}%`));
						break;
					default:
						console.error(
							`Error: unsupported operator "${op}" on "${key}" (use eq/ne/></=</=</>=/contains/startsWith)`,
						);
						process.exit(1);
				}
			}
		} else {
			conditions.push(eq(col, coerce(value)));
		}
	}

	// ------------------------------------------------------------------
	// Execute.
	// ------------------------------------------------------------------
	const client = new SQL(url);
	const db = drizzle({ client });

	let builder = db.select().from(target);
	if (conditions.length > 0) builder = builder.where(and(...conditions)) as any;

	if (doCount) {
		// Apply the WHERE (no limit/order) and return the matching count.
		const rows = await builder;
		console.log(JSON.stringify({ table: tableArg, count: rows.length }));
		return;
	}

	// Ordering — default to `updated_at` desc when the column exists. Use the
	// drizzle `desc`/`asc` operators (columns from `drizzle:Columns` don't carry
	// a `.desc()` method).
	const orderField =
		sort?.field ?? (cols["updated_at"] ? "updated_at" : "created_at");
	if (cols[orderField]) {
		const orderCol = cols[orderField];
		builder = builder.orderBy(
			(sort?.dir ?? "desc") === "desc" ? desc(orderCol) : asc(orderCol),
		) as any;
	}
	builder = builder.limit(limit) as any;

	const rows = await builder;
	console.log(JSON.stringify(rows, null, 2));
	console.log(`\n${rows.length} row(s) from "${tableArg}".`);
}
