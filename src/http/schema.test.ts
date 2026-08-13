/**
 * http/schema — tests for the zero-setup schema bootstrap helpers:
 *   - `normalizeDatabaseUrl`: Bun's SQL adapter rejects `sqlite:///:memory:`
 *     with SQLITE_CANTOPEN; the env files use it, so serve normalises it.
 *   - `ensureSchema`: applies the generated drizzle SQL to an empty DB only.
 */
import { SQL } from "bun";
import { describe, expect, it } from "bun:test";

import { ensureSchema, hasSchema, normalizeDatabaseUrl } from "./schema";

describe("normalizeDatabaseUrl", () => {
	it("maps the 3-slash :memory: forms Bun cannot open", () => {
		expect(normalizeDatabaseUrl("sqlite:///:memory:")).toBe(":memory:");
		expect(normalizeDatabaseUrl("sqlite:///memory:")).toBe(":memory:");
		expect(normalizeDatabaseUrl("sqlite://:memory:")).toBe(":memory:");
		expect(normalizeDatabaseUrl("sqlite::memory:")).toBe(":memory:");
		expect(normalizeDatabaseUrl(":memory:")).toBe(":memory:");
	});

	it("passes file URLs through unchanged", () => {
		expect(normalizeDatabaseUrl("file:./dev.db")).toBe("file:./dev.db");
		expect(normalizeDatabaseUrl("sqlite:///tmp/dev.db")).toBe(
			"sqlite:///tmp/dev.db",
		);
		expect(normalizeDatabaseUrl("")).toBe("");
	});
});

describe("ensureSchema", () => {
	it("creates the schema for an empty in-memory DB", async () => {
		const client = new SQL(":memory:");
		const created = await ensureSchema(client);
		expect(created).toBe(true);
		expect(await hasSchema(client)).toBe(true);

		// The tables from the generated migrations exist.
		const rows = (await client.unsafe(
			`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
		)) as Array<{ name: string }>;
		const names = rows.map((r) => r.name);
		expect(names).toContain("users");
		expect(names).toContain("boards");
		expect(names).toContain("threads");
		expect(names).toContain("replies");
		expect(names).toContain("posts");
		client.close();
	});

	it("is a no-op when tables already exist (data preserved)", async () => {
		const client = new SQL(":memory:");
		await ensureSchema(client);
		await client.unsafe(
			`INSERT INTO "users" ("id","name","email","role","age","created_at") VALUES ('u1','Ada','a@x.io','member',30,'2000-01-01T00:00:00.000Z')`,
		);

		const createdAgain = await ensureSchema(client);
		expect(createdAgain).toBe(false); // untouched

		const rows = (await client.unsafe(
			`SELECT name FROM "users"`,
		)) as Array<{ name: string }>;
		expect(rows).toHaveLength(1);
		expect(rows[0]!.name).toBe("Ada");
		client.close();
	});
});
