/**
 * Applies the Postgres migrations.
 * Requires a running Postgres (`docker compose up -d`) and `DATABASE_URL`.
 */

import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const url =
  process.env["DATABASE_URL"] ?? "postgres://postgres:postgres@localhost:5432/mydb";
const client = postgres(url, { max: 1 });
const db = drizzle(client);
await migrate(db, { migrationsFolder: "./drizzle/postgres" });
await client.end();
console.log("Postgres migrations applied");
