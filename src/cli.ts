import { resolve } from "node:path";

import { databaseUrl } from "@/macros/envs" with { type: "macro" };

const SCRIPTS = resolve(import.meta.dir, "../scripts");

/** Spawn a Bun script, inheriting stdio, and exit with its code on failure. */
async function runScript(script: string, args: string[] = []): Promise<void> {
	const child = Bun.spawn(["bun", "run", resolve(SCRIPTS, script), ...args], {
		stdout: "inherit",
		stderr: "inherit",
		stdin: "inherit",
	});
	const code = await child.exited;
	if (code !== 0) process.exit(code);
}

function printHelp(bin = "artefact") {
	console.log(`
Usage: ${bin} <command> [args]

Commands:
  build                   Bundle the app via scripts/build.ts (wires the typia transform)
  echo <message>          Print the message back to stdout
  add <a> <b>             Add two numbers
  subtract <a> <b>        Subtract b from a

  models:build            Build every model's SQL projection -> src/generated/models.json
                          (imports all models, runs the typia transform, derives plans
                           via the SqlSerialisable capacity / deriveSqlPlan)

  db:generate [dialect]   Depends on models:build. Generate CREATE TABLE migration SQL
                          (sqlite | pg, default sqlite) into drizzle/ from models.json

  db:migrate              Depends on models:build. Apply the generated migrations to the
                          database from the databaseUrl() macro (drizzle-orm/bun-sql)

  query <table> [json]    Run a query against the DB via drizzle-orm/bun-sql + databaseUrl().
                          <table> is a model/table name (e.g. "users", "UserSchema"); the
                          derived drizzle table is selected. Optional [json] is a JSON filter
                          object applied as WHERE equality.
`);
}

function parseNumber(value: string, name: string): number {
	const n = Number(value);
	if (Number.isNaN(n)) {
		console.error(`Error: "${name}" must be a number, got "${value}"`);
		process.exit(1);
	}
	return n;
}

export async function run(argv = process.argv.slice(2)) {
	const [command, ...args] = argv;

	switch (command) {
		case "echo": {
			if (args.length === 0) {
				console.error("Error: echo requires a message");
				process.exit(1);
			}
			console.log(args.join(" "));
			break;
		}

		case "add": {
			if (args.length < 2) {
				console.error("Error: add requires two numbers");
				process.exit(1);
			}
			const a = parseNumber(args[0]!, "a");
			const b = parseNumber(args[1]!, "b");
			console.log(a + b);
			break;
		}

		case "subtract": {
			if (args.length < 2) {
				console.error("Error: subtract requires two numbers");
				process.exit(1);
			}
			const a = parseNumber(args[0]!, "a");
			const b = parseNumber(args[1]!, "b");
			console.log(a - b);
			break;
		}

		case "build": {
			// Delegate to the programmatic build script, which wires the
			// @ttsc/unplugin/bun plugin so the typia transform runs during bundling.
			await runScript("build.ts");
			break;
		}

		case "models:build": {
			await runScript("model-build.ts");
			break;
		}

		case "db:generate": {
			// Depends on models:build — rebuild the plans first so the migrations
			// always reflect the current models.
			await runScript("model-build.ts");
			const dialect = args[0];
			await runScript("db-generate.ts", dialect ? [dialect] : []);
			break;
		}

		case "db:migrate": {
			// Depends on models:build — regenerate from the latest models, then apply.
			await runScript("model-build.ts");
			await runScript("db-migrate.ts");
			break;
		}

		case "query": {
			await runQuery(args[0], args[1]);
			break;
		}

		default: {
			if (command) {
				console.error(`Error: unknown command "${command}"`);
			}
			printHelp();
			process.exit(command ? 1 : 0);
		}
	}
}

/**
 * `query <table> [jsonFilter]` — run `db.select().from(table)` against the DB
 * via `drizzle-orm/bun-sql` + the `databaseUrl()` build macro, exactly as the
 * app does. `<table>` is a model/table name; the model is looked up in the
 * registry and its derived drizzle `table` (from `SqlSerialisable`) is used as
 * the `.from()` target. Optional `[json]` is a JSON object of equality filters
 * (e.g. `{"published": true}`) applied as a WHERE clause.
 */
async function runQuery(tableArg?: string, filterArg?: string): Promise<void> {
	if (!tableArg) {
		console.error('Error: query requires a <table> name, e.g. `query users`');
		process.exit(1);
	}

	// Import the models (runs the typia transform + SqlSerialisable) so the
	// registry is populated and every `.table` is derived.
	await import("@/models/user");
	await import("@/models/post");

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

	// Resolve the table: try an exact schemaName/table-name match, then a
	// case-insensitive match on the derived table name.
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
			.map(([, c]) => `${c.schemaName}(${c.table?.[Symbol.for("drizzle:Name")]})`)
			.join(", ");
		console.error(
			`Error: unknown table "${tableArg}". Known models: ${known || "(none)"}`,
		);
		process.exit(1);
	}

	const db = drizzle(url);
	let builder = db.select().from(target);
	if (filterArg) {
		let filter: Record<string, unknown>;
		try {
			filter = JSON.parse(filterArg) as Record<string, unknown>;
		} catch {
			console.error(`Error: filter is not valid JSON: "${filterArg}"`);
			process.exit(1);
		}
		const { eq, and } = await import("drizzle-orm");
		const cols: Record<string, any> = target[Symbol.for("drizzle:Columns")];
		const conditions = Object.entries(filter).map(([k, v]) => {
			const col = cols[k];
			if (!col) {
				console.error(`Error: unknown column "${k}" on table "${tableArg}"`);
				process.exit(1);
			}
			return eq(col, v as any);
		});
		builder = builder.where(and(...conditions)) as typeof builder;
	}

	const rows = await builder;
	console.log(JSON.stringify(rows, null, 2));
	console.log(`\n${rows.length} row(s) from "${tableArg}".`);
}
