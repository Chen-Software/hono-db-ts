/**
 * Aggregable — tests for the in-memory `Model.aggregate` (GROUP BY + COUNT /
 * SUM / AVG / MIN / MAX over the reflected schema) AND the generated SQL route
 * (`Model.serveAggregate` → `GET /<path>`, a real `SELECT … GROUP BY …`).
 *
 * The query-param surface must behave IDENTICALLY in memory and over SQL — the
 * same `?groupBy=&count=&orderBy=` params, the same `Queriable`-style row
 * filters, the same permissive "never 400" policy.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { SQL } from "bun";
import { Hono } from "hono";

import { Post } from "../models/post";
import { User } from "../models/user";

// ---------------------------------------------------------------------------
// In-memory suite — Post (counting / grouping) + User (numeric roll-ups).
// ---------------------------------------------------------------------------

const posts = [
	{ id: "p1", authorId: "u1", published: true, title: "a", body: "x" },
	{ id: "p2", authorId: "u1", published: true, title: "b", body: "y" },
	{ id: "p3", authorId: "u2", published: false, title: "c", body: "z" },
	{ id: "p4", authorId: "u2", published: true, title: "d", body: "w" },
	{ id: "p5", authorId: "u3", published: false, title: "e", body: "v" },
];

const users = [
	{ id: "u1", role: "admin", age: 40, name: "Ada", email: "ada@example.com" },
	{ id: "u2", role: "member", age: 20, name: "Bob", email: "bob@example.com" },
	{
		id: "u3",
		role: "member",
		age: 30,
		name: "Carol",
		email: "carol@example.com",
	},
	{ id: "u4", role: "viewer", age: 25, name: "Dan", email: "dan@example.com" },
];

describe("Aggregable — in-memory COUNT + GROUP BY (Post)", () => {
	it("groups by a field and counts per group", () => {
		const rows = Post.aggregate(posts as any, {
			groupBy: "authorId",
			count: "*",
		});
		// Default order: first group field ascending → u1, u2, u3.
		expect(rows).toEqual([
			{ authorId: "u1", count: 2 },
			{ authorId: "u2", count: 2 },
			{ authorId: "u3", count: 1 },
		]);
	});

	it("ranks with orderBy=count:desc (the 'most posts' question)", () => {
		const rows = Post.aggregate(posts as any, {
			groupBy: "authorId",
			count: "*",
			orderBy: "count:desc",
		});
		expect(rows).toHaveLength(3);
		expect(rows[0].count).toBe(2);
		expect(rows[1].count).toBe(2);
		expect(rows[2].authorId).toBe("u3");
		expect(rows[2].count).toBe(1);
	});

	it("filters BEFORE grouping with Queriable semantics", () => {
		const rows = Post.aggregate(posts as any, {
			groupBy: "authorId",
			count: "*",
			published: "true", // boolean eq — only published posts
		});
		expect(rows).toEqual([
			{ authorId: "u1", count: 2 },
			{ authorId: "u2", count: 1 }, // u3 has no published posts
		]);
	});

	it("applies limit to the group rows", () => {
		const rows = Post.aggregate(posts as any, {
			groupBy: "authorId",
			count: "*",
			orderBy: "count:desc",
			limit: "2",
		});
		expect(rows).toHaveLength(2);
	});

	it("counts the whole set when neither groupBy nor aggregates are given", () => {
		expect(Post.aggregate(posts as any, {})).toEqual([{ count: 5 }]);
	});

	it("is permissive: unknown groupBy fields and params are dropped, never 400", () => {
		const dropped = Post.aggregate(posts as any, {
			groupBy: "notAField",
			count: "*",
		});
		expect(dropped).toEqual([{ count: 5 }]);

		const junk = Post.aggregate(posts as any, {
			groupBy: "authorId",
			count: "*",
			zzz: "ignored",
		});
		expect(junk).toHaveLength(3);
	});
});

describe("Aggregable — in-memory numeric roll-ups (User)", () => {
	it("averages a numeric field per group (avg=age)", () => {
		const rows = User.aggregate(users as any, { groupBy: "role", avg: "age" });
		// Default order: role asc → admin, member, viewer.
		expect(rows).toEqual([
			{ role: "admin", avg_age: 40 },
			{ role: "member", avg_age: 25 }, // (20+30)/2
			{ role: "viewer", avg_age: 25 },
		]);
	});

	it("sums a numeric field per group (sum=age)", () => {
		const rows = User.aggregate(users as any, { groupBy: "role", sum: "age" });
		expect(rows.find((r) => r.role === "member")).toEqual({
			role: "member",
			sum_age: 50,
		});
	});

	it("computes min + max in one pass (min=age&max=age)", () => {
		const rows = User.aggregate(users as any, {
			groupBy: "role",
			min: "age",
			max: "age",
		});
		expect(rows.find((r) => r.role === "member")).toEqual({
			role: "member",
			min_age: 20,
			max_age: 30,
		});
		expect(rows.find((r) => r.role === "admin")).toEqual({
			role: "admin",
			min_age: 40,
			max_age: 40,
		});
	});

	it("supports comma-separated counts (count=*,age)", () => {
		const rows = User.aggregate(users as any, {
			groupBy: "role",
			count: "*,age",
		});
		// COUNT(*) == COUNT(age) here — every user has an age.
		const admin = rows.find((r) => r.role === "admin");
		expect(admin).toEqual({ role: "admin", count: 1, count_age: 1 });
	});

	it("honours the `mail` alias in the pre-aggregation filter", () => {
		const rows = User.aggregate(users as any, {
			groupBy: "role",
			count: "*",
			mail: "ada", // alias for email → only Ada (admin)
		});
		expect(rows).toEqual([{ role: "admin", count: 1 }]);
	});
});

// ---------------------------------------------------------------------------
// SQL suite — real Bun SQL client + Hono app, `serveAggregate` generated routes.
// ---------------------------------------------------------------------------

const DDL = `
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"author" text NOT NULL,
	"authorId" text NOT NULL,
	"contentHash" text NOT NULL,
	"published" integer NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
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
`;

const SEED = `
INSERT INTO "posts" ("id","title","body","author","authorId","contentHash","published","created_at","updated_at") VALUES
	('p1','t1','b1','{}','u1','h1',1,'2020-01-01T00:00:00.000Z','2020-01-01T00:00:00.000Z'),
	('p2','t2','b2','{}','u1','h2',1,'2020-02-01T00:00:00.000Z','2020-02-01T00:00:00.000Z'),
	('p3','t3','b3','{}','u2','h3',0,'2020-03-01T00:00:00.000Z','2020-03-01T00:00:00.000Z'),
	('p4','t4','b4','{}','u2','h4',1,'2020-04-01T00:00:00.000Z','2020-04-01T00:00:00.000Z'),
	('p5','t5','b5','{}','u3','h5',0,'2020-05-01T00:00:00.000Z','2020-05-01T00:00:00.000Z');
INSERT INTO "users" ("id","name","email","role","age","created_at") VALUES
	('u1','Ada','ada@example.com','admin',30,'2000-01-01T00:00:00.000Z'),
	('u2','Bob','bob@example.com','member',25,'2001-06-15T00:00:00.000Z'),
	('u3','Carol','carol@example.com','viewer',40,'2002-12-31T00:00:00.000Z');
`;

let client: SQL;
let app: Hono;

beforeAll(async () => {
	client = new SQL(":memory:");
	await client.unsafe(DDL);
	await client.unsafe(SEED);

	app = new Hono();
	(Post as any).serveAggregate(app, client);
	(User as any).serveAggregate(app, client);
});

afterAll(() => {
	client.close();
});

async function get(path: string): Promise<{ status: number; body: any }> {
	const res = await app.request(`http://local${path}`);
	return { status: res.status, body: await res.json() };
}

describe("Aggregable — generated SQL route (Post)", () => {
	it("groups + counts over SQL with orderBy (the 'most posts' question)", async () => {
		const { status, body } = await get(
			"/posts/aggregate?groupBy=authorId&count=*&orderBy=count:desc&limit=10",
		);
		expect(status).toBe(200);
		expect(body.ok).toBe(true);
		// SQL ties (u1/u2 both = 2) have no guaranteed order — compare counts
		// by author, and pin only the unambiguous last row (lowest count).
		const byAuthor = Object.fromEntries(
			(body.data as Array<{ authorId: string; count: number }>).map((r) => [
				r.authorId,
				r.count,
			]),
		);
		expect(byAuthor).toEqual({ u1: 2, u2: 2, u3: 1 });
		expect(body.data[body.data.length - 1].authorId).toBe("u3");
	});

	it("applies Queriable-style filters over SQL (published=true → 0/1)", async () => {
		const { body } = await get(
			"/posts/aggregate?groupBy=authorId&count=*&published=true",
		);
		expect(body.data).toEqual([
			{ authorId: "u1", count: 2 },
			{ authorId: "u2", count: 1 },
		]);
	});

	it("defaults to a whole-set count when no groupBy/aggregate is given", async () => {
		const { body } = await get("/posts/aggregate");
		expect(body.data).toEqual([{ count: 5 }]);
	});

	it("is permissive over SQL: unknown groupBy fields are dropped", async () => {
		const { status, body } = await get(
			"/posts/aggregate?groupBy=notAField&count=*",
		);
		expect(status).toBe(200);
		expect(body.data).toEqual([{ count: 5 }]);
	});
});

describe("Aggregable — generated SQL route (User)", () => {
	it("averages a numeric field per group", async () => {
		const { status, body } = await get("/users/aggregate?groupBy=role&avg=age");
		expect(status).toBe(200);
		expect(body.data).toEqual([
			{ role: "admin", avg_age: 30 },
			{ role: "member", avg_age: 25 },
			{ role: "viewer", avg_age: 40 },
		]);
	});

	it("counts per role over SQL", async () => {
		const { body } = await get("/users/aggregate?groupBy=role&count=*");
		expect(body.data).toEqual([
			{ role: "admin", count: 1 },
			{ role: "member", count: 1 },
			{ role: "viewer", count: 1 },
		]);
	});
});

describe("Aggregable — introspection", () => {
	it("aggregateSpec() reports path, table, groupable fields and aggregates", () => {
		const spec = (Post as any).aggregateSpec();
		expect(spec.path).toBe("/posts/aggregate");
		expect(spec.table).toBe("posts");
		const params = spec.fields.map((f: any) => f.param);
		expect(params).toContain("authorId");
		expect(params).toContain("published");
		expect(spec.aggregates.count).toContain("*");
		expect(spec.aggregates.count).toContain("authorId");
	});

	it("exposes numeric fields as SUM/AVG/MIN/MAX targets on User", () => {
		const spec = (User as any).aggregateSpec();
		expect(spec.aggregates.sum).toContain("age");
		expect(spec.aggregates.avg).toContain("age");
		expect(spec.aggregates.min).toContain("age");
		expect(spec.aggregates.max).toContain("age");
	});
});
