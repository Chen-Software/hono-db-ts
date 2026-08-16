/**
 * Servable — end-to-end test: a real Bun `SQL` client + a real Hono app, with
 * routes generated from the models (`User.serve`, `Repository.serve`). Verifies
 * that the SQL-backed routes reproduce `Queriable`'s in-memory matcher
 * semantics (eq / substring / range / list / permissive) plus keyset cursor
 * pagination.
 */
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { makeTestDb, type TestDb } from "./test-db";
import { Repository } from "../models/repository";
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
	"post_count" integer,
	"thread_count" integer,
	"reply_count" integer,
	"all_activities" integer,
	"created_at" text NOT NULL
);
CREATE TABLE "repositories" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"ownerId" text,
	"name" text NOT NULL,
	"lowerName" text NOT NULL,
	"description" text NOT NULL,
	"defaultBranch" text NOT NULL,
	"website" text NOT NULL,
	"isPrivate" integer NOT NULL,
	"isArchived" integer NOT NULL,
	"isMirror" integer NOT NULL,
	"isTemplate" integer NOT NULL,
	"objectFormatName" text NOT NULL,
	"topics" text NOT NULL,
	"numStars" integer NOT NULL,
	"numForks" integer NOT NULL,
	"numOpenIssues" integer NOT NULL,
	"numClosedIssues" integer NOT NULL,
	"size" integer NOT NULL,
	"avatar" text NOT NULL,
	"status" integer NOT NULL
);
`;

const SEED = `
INSERT INTO "users" ("id","name","email","role","age","created_at") VALUES
	('u1','Ada','ada@example.com','admin',30,'2000-01-01T00:00:00.000Z'),
	('u2','Bob','bob@example.com','member',25,'2001-06-15T00:00:00.000Z'),
	('u3','Carol','carol@example.com','viewer',40,'2002-12-31T00:00:00.000Z');
INSERT INTO "repositories" (
	"id","created_at","ownerId","name","lowerName","description",
	"defaultBranch","website","isPrivate","isArchived","isMirror","isTemplate",
	"objectFormatName","topics","numStars","numForks","numOpenIssues","numClosedIssues",
	"size","avatar","status"
) VALUES
	('r1','2000-01-01T00:00:00.000Z',null,'Tech Talk','tech-talk','faster','main','','1',0,0,0,'sha1','[]',3,0,0,0,0,'',0),
	('r2','2005-08-08T00:00:00.000Z',null,'Life','life','slower','main','','0',0,0,0,'sha1','[]',1,0,0,0,0,'',0),
	('r3','2010-01-01T00:00:00.000Z',null,'Games','games','fun','main','','0',0,0,0,'sha1','[]',2,0,0,0,0,'',0);
`;

let db: TestDb["db"];
let closeDb: () => Promise<void>;
let app: Hono;

beforeAll(async () => {
	const td = await makeTestDb(DDL, SEED);
	db = td.db;
	closeDb = td.close;

	app = new Hono();
	(User as any).serve(app, db);
	(Repository as any).serve(app, db);
});

afterAll(async () => {
	await closeDb();
});

async function get(path: string): Promise<{ status: number; body: any }> {
	const res = await app.request(`http://local${path}`);
	return { status: res.status, body: await res.json() };
}

describe("Servable — generated list routes", () => {
	it("returns every row, sorted by the configured sort key", async () => {
		const { status, body } = await get("/repositories");
		expect(status).toBe(200);
		expect(body.ok).toBe(true);
		// created_at desc → Games, Life, Tech Talk
		expect(body.data.rows.map((r: any) => r.id)).toEqual(["r3", "r2", "r1"]);
		expect(body.data.nextCursor).toBeNull();
	});

	it("decodes booleans through fromRow", async () => {
		const { body } = await get("/repositories");
		expect(body.data.rows[0].isPrivate).toBe(false); // stored as 0, decoded to false
	});

	it("filters with substring semantics (Queriable reuse)", async () => {
		const { body } = await get("/repositories?name=tech");
		expect(body.data.rows.map((r: any) => r.id)).toEqual(["r1"]);
	});

	it("filters booleans with exact equality", async () => {
		const { body } = await get("/repositories?isPrivate=true");
		expect(body.data.rows.map((r: any) => r.id)).toEqual(["r1"]);
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
		const all = await get("/repositories");
		const withJunk = await get("/repositories?zzz=1&name=");
		expect(withJunk.body.data.rows).toHaveLength(all.body.data.rows.length);
	});

	it("paginates with a keyset cursor", async () => {
		const page1 = await get("/repositories?limit=2");
		expect(page1.body.data.rows.map((r: any) => r.id)).toEqual(["r3", "r2"]);
		expect(page1.body.data.nextCursor).not.toBeNull();

		const page2 = await get(
			`/repositories?limit=2&cursor=${page1.body.data.nextCursor}`,
		);
		expect(page2.body.data.rows.map((r: any) => r.id)).toEqual(["r1"]);
		expect(page2.body.data.nextCursor).toBeNull();
	});

	it("clamps limit to [1, max]", async () => {
		const { body } = await get("/repositories?limit=9999");
		expect(body.data.rows).toHaveLength(3); // max 100 but only 3 rows
		const one = await get("/repositories?limit=0");
		expect(one.body.data.rows).toHaveLength(1);
	});
});

describe("Servable — generated by-id route", () => {
	it("returns a single row", async () => {
		const { status, body } = await get("/repositories/r1");
		expect(status).toBe(200);
		expect(body.ok).toBe(true);
		expect(body.data.id).toBe("r1");
		expect(body.data.name).toBe("Tech Talk");
	});

	it("404s when the id is absent", async () => {
		const { status, body } = await get("/repositories/does-not-exist");
		expect(status).toBe(404);
		expect(body.ok).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Write routes — the CRUD surface: POST / PUT / DELETE per model.
// ---------------------------------------------------------------------------

let writeDb: TestDb["db"];
let closeWriteDb: () => Promise<void>;
let writeApp: Hono;

const makeRepoBody = (overrides: Record<string, unknown> = {}) => ({
	name: "Fresh repo",
	lowerName: "fresh-repo",
	description: "desc",
	defaultBranch: "main",
	website: "",
	isPrivate: false,
	isArchived: false,
	isMirror: false,
	isTemplate: false,
	objectFormatName: "sha1",
	topics: [],
	numStars: 0,
	numForks: 0,
	numOpenIssues: 0,
	numClosedIssues: 0,
	numStars: 0,
	numForks: 0,
	numOpenIssues: 0,
	numClosedIssues: 0,
	size: 0,
	avatar: "",
	status: 0,
	...overrides,
});

beforeAll(async () => {
	const td = await makeTestDb(DDL, SEED);
	writeDb = td.db;
	closeWriteDb = td.close;

	writeApp = new Hono();
	(Repository as any).serve(writeApp, writeDb);
});

afterAll(async () => {
	await closeWriteDb();
});

async function send(
	method: string,
	path: string,
	body?: unknown,
): Promise<{ status: number; body: any }> {
	const res = await writeApp.request(`http://local${path}`, {
		method,
		headers:
			body !== undefined ? { "content-type": "application/json" } : undefined,
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});
	return { status: res.status, body: await res.json().catch(() => null) };
}

describe("Servable — POST (create)", () => {
	it("creates a repository: generates id + timestamps, decodes booleans", async () => {
		const { status, body } = await send("POST", "/repositories", makeRepoBody({ isPrivate: true }));
		expect(status).toBe(201);
		expect(body.ok).toBe(true);
		expect(body.data.name).toBe("Fresh repo");
		expect(body.data.isPrivate).toBe(true); // decoded from stored 1
		expect(body.data.id).toBeTruthy();
		expect(body.data.created_at).toBeTruthy();
	});

	it("rejects an invalid create via the Validatable assert", async () => {
		// Repository.assert requires name/lowerName/etc. — missing name fails.
		const { status, body } = await send("POST", "/repositories", {
			lowerName: "x",
			description: "d",
		});
		expect(status).toBe(400);
		expect(body.ok).toBe(false);
	});

	it("rejects a non-object body", async () => {
		const { status } = await send("POST", "/repositories", [1, 2, 3]);
		expect(status).toBe(400);
	});
});

describe("Servable — PUT (partial update)", () => {
	it("updates only the provided columns (name) without null-clobbering", async () => {
		const created = await send("POST", "/repositories", makeRepoBody());
		const id = created.body.data.id;

		const { status, body } = await send("PUT", `/repositories/${id}`, {
			name: "Updated name",
		});
		expect(status).toBe(200);
		expect(body.ok).toBe(true);
		expect(body.data.name).toBe("Updated name");
		// Untouched columns survive (partial update, no null clobber).
		expect(body.data.lowerName).toBe("fresh-repo");
		expect(body.data.description).toBe("desc");
		// `Repository` has no `updated_at`, so the patch leaves created_at as-is.
		expect(body.data.created_at).toBe(created.body.data.created_at);
	});

	it("404s when updating an absent id", async () => {
		const { status } = await send("PUT", "/repositories/does-not-exist", {
			name: "x",
		});
		expect(status).toBe(404);
	});
});

describe("Servable — DELETE", () => {
	it("deletes a repository", async () => {
		const created = await send("POST", "/repositories", makeRepoBody());
		const id = created.body.data.id;

		const { status, body } = await send("DELETE", `/repositories/${id}`);
		expect(status).toBe(200);
		expect(body.data.deleted).toBe(true);

		// Repository gone.
		const gone = await writeApp.request(`http://local/repositories/${id}`);
		expect(gone.status).toBe(404);
	});

	it("404s when deleting an absent id", async () => {
		const { status } = await send("DELETE", "/repositories/does-not-exist");
		expect(status).toBe(404);
	});
});

describe("Servable — routeSpec exposes writes", () => {
	it("reports write: true for the generated CRUD", () => {
		const spec = (Repository as any).routeSpec();
		expect(spec.write).toBe(true);
	});
});

describe("Servable — introspection", () => {
	it("routeSpec() reports path, sort, and queryable params", () => {
		const spec = (Repository as any).routeSpec();
		expect(spec.path).toBe("/repositories");
		expect(spec.table).toBe("repositories");
		expect(spec.sort).toEqual({ field: "created_at", dir: "desc" });
		const params = spec.fields.map((f: any) => f.param);
		expect(params).toContain("name");
		expect(params).toContain("created_at");
		expect(params).toContain("ownerId");
	});

	it("User's sort falls back to created_at (no updated_at)", () => {
		const spec = (User as any).routeSpec();
		expect(spec.sort).toEqual({ field: "created_at", dir: "desc" });
	});
});

describe("Servable — readonly (server-managed) fields", () => {
	let app: Hono;
	beforeAll(() => {
		app = writeApp;
	});

	it("POST uses the server clock for created_at/updated_at (client cannot forge)", async () => {
		const res = await app.request("http://local/repositories", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				...makeRepoBody(),
				created_at: "1999-01-01T00:00:00.000Z",
				updated_at: "1999-01-01T00:00:00.000Z",
			}),
		});
		expect(res.status).toBe(201);
		const row = (await res.json()).data;
		expect(row.created_at).not.toBe("1999-01-01T00:00:00.000Z");
		expect(new Date(row.created_at).getTime()).toBeGreaterThan(
			Date.now() - 5000,
		);
		// `Repository` has no `updated_at` (only `created_at`) — the forged value
		// is simply dropped, so there is no server-stamped `updated_at` to check.
		expect(row.name).toBe("Fresh repo");
	});

	it("PUT ignores client-supplied created_at and id (server-managed)", async () => {
		const created = await (
			await app.request("http://local/repositories", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(makeRepoBody()),
			})
		).json();
		const origCreated = created.data.created_at;

		const forged = "ffffffff-ffff-4fff-8fff-ffffffffffff";
		const res = await app.request(`http://local/repositories/${created.data.id}`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				created_at: "1999-01-01T00:00:00.000Z",
				id: forged,
				name: "patched",
			}),
		});
		expect(res.status).toBe(200);
		const row = (await res.json()).data;
		// created_at stays the original; id stays the URL id; the real patch applies.
		expect(row.created_at).toBe(origCreated);
		expect(row.id).toBe(created.data.id);
		expect(row.name).toBe("patched");
	});
});
