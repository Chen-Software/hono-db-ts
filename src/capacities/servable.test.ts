/**
 * Servable — end-to-end test: a real Bun `SQL` client + a real Hono app, with
 * routes generated from the models (`User.serve`, `Board.serve`,
 * `Thread.serve`). Verifies that the SQL-backed routes reproduce `Queriable`'s
 * in-memory matcher semantics (eq / substring / range / list / permissive)
 * plus keyset cursor pagination.
 */
import { SQL } from "bun";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { Board } from "../models/board";
import { Thread } from "../models/thread";
import { User } from "../models/user";

// ---------------------------------------------------------------------------
// In-memory SQLite schema (mirrors the `db-generate` sqlite projection).
// ---------------------------------------------------------------------------
const DDL = `
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"age" integer NOT NULL,
	"created_at" text NOT NULL
);
CREATE TABLE "boards" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"moderatorId" text NOT NULL,
	"created_at" text NOT NULL
);
CREATE TABLE "threads" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"boardId" text NOT NULL,
	"authorId" text NOT NULL,
	"title" text NOT NULL,
	"pinned" integer NOT NULL,
	"locked" integer NOT NULL
);
`;

const SEED = `
INSERT INTO "users" ("id","name","email","role","age","created_at") VALUES
	('u1','Ada','ada@example.com','admin',30,'2000-01-01T00:00:00.000Z'),
	('u2','Bob','bob@example.com','member',25,'2001-06-15T00:00:00.000Z'),
	('u3','Carol','carol@example.com','viewer',40,'2002-12-31T00:00:00.000Z');
INSERT INTO "boards" ("id","name","slug","description","moderatorId","created_at") VALUES
	('b1','Tech Talk','tech-talk','faster','u1','2000-05-05T00:00:00.000Z'),
	('b2','Life','life','slower','u2','2005-08-08T00:00:00.000Z'),
	('b3','Games','games','fun','u1','2010-01-01T00:00:00.000Z');
INSERT INTO "threads" ("id","created_at","updated_at","boardId","authorId","title","pinned","locked") VALUES
	('t1','2001-01-01T00:00:00.000Z','2010-01-01T00:00:00.000Z','b1','u1','Hello world',1,0),
	('t2','2002-02-02T00:00:00.000Z','2008-01-01T00:00:00.000Z','b1','u2','Deep dive',0,0),
	('t3','2003-03-03T00:00:00.000Z','2020-01-01T00:00:00.000Z','b2','u3','Coffee talk',1,1);
`;

let client: SQL;
let app: Hono;

beforeAll(async () => {
	client = new SQL(":memory:");
	await client.unsafe(DDL);
	await client.unsafe(SEED);

	app = new Hono();
	(User as any).serve(app, client);
	(Board as any).serve(app, client);
	(Thread as any).serve(app, client);
});

afterAll(() => {
	client.close();
});

async function get(path: string): Promise<{ status: number; body: any }> {
	const res = await app.request(`http://local${path}`);
	return { status: res.status, body: await res.json() };
}

describe("Servable — generated list routes", () => {
	it("returns every row, sorted by the configured sort key", async () => {
		const { status, body } = await get("/boards");
		expect(status).toBe(200);
		expect(body.ok).toBe(true);
		// created_at desc → Games, Life, Tech Talk
		expect(body.data.rows.map((r: any) => r.id)).toEqual(["b3", "b2", "b1"]);
		expect(body.data.nextCursor).toBeNull();
	});

	it("decodes booleans through fromRow", async () => {
		const { body } = await get("/threads");
		expect(body.data.rows[0].pinned).toBe(true); // stored as 1, decoded to true
	});

	it("filters with substring semantics (Queriable reuse)", async () => {
		const { body } = await get("/boards?name=tech");
		expect(body.data.rows.map((r: any) => r.id)).toEqual(["b1"]);
	});

	it("filters booleans with exact equality", async () => {
		const { body } = await get("/threads?pinned=true");
		expect(body.data.rows.map((r: any) => r.id)).toEqual(["t3", "t1"]);
	});

	it("filters numbers with exact equality (bare range value)", async () => {
		const { body } = await get("/users?age=30");
		expect(body.data.rows.map((r: any) => r.id)).toEqual(["u1"]);
	});

	it("filters numbers with a [min,max] range", async () => {
		const { body } = await get("/users?age=[25,35]");
		expect(body.data.rows.map((r: any) => r.id).sort()).toEqual(["u1", "u2"]);
	});

	it("filters dates with a [min,max] range", async () => {
		const { body } = await get("/users?created_at=[2001-01-01,2002-12-31]");
		expect(body.data.rows.map((r: any) => r.id).sort()).toEqual(["u2", "u3"]);
	});

	it("honours the Queriable `as` alias (?mail=)", async () => {
		const { body } = await get("/users?mail=ada");
		expect(body.data.rows.map((r: any) => r.id)).toEqual(["u1"]);
	});

	it("is permissive: unknown params and empty values are ignored", async () => {
		const all = await get("/boards");
		const withJunk = await get("/boards?zzz=1&name=");
		expect(withJunk.body.data.rows).toHaveLength(all.body.data.rows.length);
	});

	it("paginates with a keyset cursor", async () => {
		const page1 = await get("/boards?limit=2");
		expect(page1.body.data.rows.map((r: any) => r.id)).toEqual(["b3", "b2"]);
		expect(page1.body.data.nextCursor).not.toBeNull();

		const page2 = await get(`/boards?limit=2&cursor=${page1.body.data.nextCursor}`);
		expect(page2.body.data.rows.map((r: any) => r.id)).toEqual(["b1"]);
		expect(page2.body.data.nextCursor).toBeNull();
	});

	it("clamps limit to [1, max]", async () => {
		const { body } = await get("/boards?limit=9999");
		expect(body.data.rows).toHaveLength(3); // max 100 but only 3 rows
		const one = await get("/boards?limit=0");
		expect(one.body.data.rows).toHaveLength(1);
	});
});

describe("Servable — generated by-id route", () => {
	it("returns a single row", async () => {
		const { status, body } = await get("/boards/b1");
		expect(status).toBe(200);
		expect(body.ok).toBe(true);
		expect(body.data.id).toBe("b1");
		expect(body.data.moderatorId).toBe("u1");
	});

	it("404s when the id is absent", async () => {
		const { status, body } = await get("/boards/does-not-exist");
		expect(status).toBe(404);
		expect(body.ok).toBe(false);
	});
});

describe("Servable — introspection", () => {
	it("routeSpec() reports path, sort, and queryable params", () => {
		const spec = (Board as any).routeSpec();
		expect(spec.path).toBe("/boards");
		expect(spec.table).toBe("boards");
		expect(spec.sort).toEqual({ field: "created_at", dir: "desc" });
		const params = spec.fields.map((f: any) => f.param);
		expect(params).toContain("name");
		expect(params).toContain("created_at");
		expect(params).toContain("moderatorId");
	});

	it("User's sort falls back to created_at (no updated_at)", () => {
		const spec = (User as any).routeSpec();
		expect(spec.sort).toEqual({ field: "created_at", dir: "desc" });
	});
});
