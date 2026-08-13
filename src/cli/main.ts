import { resolve } from "node:path";

import { runQuery } from "./query";

// `import.meta.dir` is src/cli — scripts live one level up at the repo root.
const SCRIPTS = resolve(import.meta.dir, "../../scripts");

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

  db:seed [counts…]       Seed the DB with BBS data (Randomisable.random()): defaults
                          50 users / 100 boards / 1000 posts / 1000 threads / 2000 replies

  query <table> [jsonFilter] [--limit N] [--sort f[:asc|desc]] [--count]
                          Query a model table via drizzle-orm/bun-sql + databaseUrl().
                          <table> = users|boards|threads|replies|posts (or schemaName).
                          jsonFilter supports equality {"role":"admin"}, comparisons
                          {"age":{">":30}}, and LIKE search {"title":{"contains":"x"}}.
                          Booleans are coerced to 0/1. Default order: updated_at desc.

  serve [port]            Run the local BBS query server (scripts/serve.ts, default
                          :8787). Serves the Honox UI at / (when built) and the
                          JSON query API at /api.

  ui:build                Build the Honox UI in /app -> dist/ui/_worker.js
                          (vite.ui.config.ts: honox routes/islands + ttsc + tailwind,
                          via @hono/vite-build/bun). Do this before serve to get
                          the UI.

  ui:dev                  Run the Honox UI dev server (vite, HMR on :8787).

  cf-build                Bundle src/worker.ts into dist/worker.js for a Cloudflare
                          Worker (inlines the generated migration SQL). Depends on
                          db:generate (regenerates drizzle/*.sql from the models).
                          See wrangler.jsonc / scripts/cf-build.ts.

  wrangler-config          Generate wrangler.jsonc from wrangler.config.ts, using the
                          DATABASE_TYPE macro: adds a D1 binding (env.DB) when
                          DATABASE_TYPE=d1, nodejs_compat + :memory: otherwise.

  generate                Generate EVERYTHING in one pass: models:build → db:generate
                          [dialect] → wrangler-config → cf-build. The one command for a
                          complete deployable artifact (models.json + drizzle/*.sql +
                          wrangler.jsonc + dist/worker.js).
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

		case "db:seed": {
			// Depends on migrations being applied (the tables must exist).
			await runScript("seed.ts", args);
			break;
		}

		case "query": {
			await runQuery(args);
			break;
		}

		case "serve": {
			await runScript("serve.ts", args);
			break;
		}

		case "ui:build": {
			await runScript("ui-build.ts");
			break;
		}

		case "ui:dev": {
			// Run the honox UI dev server (vite, HMR) with the dedicated config.
			const child = Bun.spawn(
				["bun", "x", "vite", "--config", "vite.ui.config.ts", ...args],
				{
					cwd: resolve(import.meta.dir, "../.."),
					stdout: "inherit",
					stderr: "inherit",
					stdin: "inherit",
				},
			);
			const code = await child.exited;
			if (code !== 0) process.exit(code);
			break;
		}

		case "cf-build": {
			// Depends on the generated migrations — regenerate them (sqlite
			// dialect) so the inlined schema matches the current models, then
			// bundle the worker.
			await runScript("model-build.ts");
			await runScript("db-generate.ts", ["sqlite"]);
			await runScript("cf-build.ts");
			break;
		}

		case "wrangler-config": {
			// Regenerate wrangler.jsonc from wrangler.config.ts (macro-driven:
			// DATABASE_TYPE=d1 adds the D1 binding).
			await runScript("../wrangler.config.ts");
			break;
		}

		case "generate": {
			// One pass over the whole generation chain — models → migrations →
			// worker config → worker bundle. The dialect argument (default
			// "sqlite") drives db:generate; the worker config adapts via the
			// DATABASE_TYPE macro.
			const dialect = args[0] ?? "sqlite";
			await runScript("model-build.ts");
			await runScript("db-generate.ts", [dialect]);
			await runScript("../wrangler.config.ts");
			await runScript("cf-build.ts");
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

// The `query` command's implementation lives in `./query` (`runQuery`) so it is
// reusable outside the CLI (e.g. programmatically, or from the HTTP server).
