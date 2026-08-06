/**
 * Env-aware schema barrel.
 *
 * Exports the **active dialect's** schema based on `DATABASE_TYPE` (via the
 * `dbDialect` macro, which inlines the literal at build time):
 *   - `d1` / `turso` / `sqlite` -> the SQLite schema
 *   - `neon` / `postgres`       -> the Postgres schema
 *
 * The `schema` export is the active module's `schema` object (keyed by table
 * name), so it **automatically includes every table** the dialect module
 * defines — adding or renaming a table in `./sqlite.ts` / `./postgres.ts` (and
 * listing it in that module's `schema` object) requires no change here. Access
 * tables as `schema.movies`, `schema.<newTable>`, etc.
 *
 * Because `dbDialect()` is a macro, the ternary below collapses to one branch at
 * build time, so only the active dialect's schema is bundled and dead code is
 * eliminated automatically during build.
 *
 */

import { dbDialect } from "../../macros/db-dialect" with { type: "macro" };
import * as sqliteSchema from "./sqlite";
import * as pgSchema from "./postgres";

const dialect = dbDialect();
// dbDialect() normalizes to the canonical values: postgres-family -> "postgres"
// or "neon". (d1/turso/sqlite all use the SQLite schema.)
const isPg = dialect === "neon" || dialect === "postgres";

const active = isPg ? pgSchema : sqliteSchema;

// The active dialect's full table schema, keyed by table name. This
// automatically includes every table the dialect module lists in its own
// `schema` object — no per-table updates needed here. Access `schema.movies`,
// `schema.<newTable>`, etc.
export const schemas = active;
