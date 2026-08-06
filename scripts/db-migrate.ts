/**
 * Applies the SQLite migrations (default: `sqlite.db`).
 * `DATABASE_URL` overrides the target file.
 */

import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";

const url = process.env["DATABASE_URL"] ?? "sqlite.db";
const sqlite = new Database(url);
sqlite.exec("PRAGMA foreign_keys = ON;");
sqlite.exec("PRAGMA journal_mode = WAL;");
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: "./drizzle/sqlite" });
console.log(`Migrations applied to ${url}`);
