import { describe, expect, it } from "bun:test";
import { Post } from "../models/post";
import { User } from "../models/user";
import { withContentHash } from "./hashable";

/** Build a valid Post instance from raw random data (mirrors seed.ts). */
function makePost(overrides: Record<string, any> = {}) {
	const data = Post.random();
	Object.assign(data, overrides);
	return Post.from(withContentHash(data, "body")) as unknown as Record<
		string,
		any
	>;
}

describe("Queriable — schema-inferred matching (Post)", () => {
	const posts = [
		makePost({
			published: true,
			title: "Hello World",
			created_at: "1998-01-01T00:00:00.000Z",
		}),
		makePost({
			published: false,
			title: "Deep dive",
			created_at: "2005-06-15T00:00:00.000Z",
		}),
		makePost({
			published: true,
			title: "Getting started",
			created_at: "2026-08-09T00:00:00.000Z",
		}),
	];

	it("infers boolean equality for `published`", () => {
		expect(Post.filter(posts as any, { published: "true" })).toHaveLength(2);
		expect(Post.filter(posts as any, { published: "false" })).toHaveLength(1);
	});

	it("infers substring for `title`", () => {
		expect(Post.filter(posts as any, { title: "deep" })).toHaveLength(1);
	});

	it("infers closed date RANGE for `created_at` via [min,max] tuple", () => {
		const r = Post.filter(posts as any, {
			created_at: "[2000-01-01,2027-01-01]",
		});
		expect(r).toHaveLength(2); // 2005, 2026
	});

	it("bare date value is an EXACT (day-level) match, not a range", () => {
		expect(
			Post.filter(posts as any, { created_at: "1998-01-01" }),
		).toHaveLength(1);
		// without brackets it is NOT a range
		expect(
			Post.filter(posts as any, { created_at: "1998-01-01,2099-01-01" }),
		).toHaveLength(0);
	});

	it("ignores unknown params (permissive)", () => {
		expect(Post.filter(posts as any, { notAField: "x" })).toHaveLength(3);
	});

	it("applies `limit`", () => {
		expect(Post.filter(posts as any, { limit: "2" })).toHaveLength(2);
	});
});

describe("Queriable — schema-inferred matching (User)", () => {
	const users = [
		{
			id: "u1",
			name: "Ada",
			email: "ada@example.com",
			role: "admin",
			age: 30,
			created_at: "2000-01-01T00:00:00.000Z",
		},
		{
			id: "u2",
			name: "Bob",
			email: "bob@example.com",
			role: "member",
			age: 17,
			created_at: "2010-05-05T00:00:00.000Z",
		},
		// `User.random()` shape is unvalidated; plain objects suffice for filter.
	] as any[];

	it("infers substring for `role`", () => {
		expect(User.filter(users, { role: "member" })).toHaveLength(1);
	});

	it("infers numeric equality for `age`", () => {
		expect(User.filter(users, { age: "17" })).toHaveLength(1);
		expect(User.filter(users, { age: "99" })).toHaveLength(0);
	});

	it("exposes email via the `?mail=` alias (Queryable tag + fields override)", () => {
		// `mail` is the alias registered for `email`; `email` is still a real
		// field too. Use the domain as the discriminator so it can't collide
		// with `name` (a plain substring field).
		expect(User.filter(users, { mail: "example.com" })).toHaveLength(2);
		expect(User.filter(users, { mail: "bob" })).toHaveLength(1);
		expect(User.filter(users, { email: "bob" })).toHaveLength(1);
	});

	it("infers closed date RANGE for `created_at` on users via [min,max]", () => {
		const r = User.filter(users, { created_at: "[2005-01-01,2020-01-01]" });
		expect(r).toHaveLength(1); // only 2010
	});

	it("infers numeric RANGE for `age` via [min,max] tuple", () => {
		expect(User.filter(users, { age: "[10,20]" })).toHaveLength(1); // only 17
		expect(User.filter(users, { age: "[18,40]" })).toHaveLength(1); // only 30
		expect(User.filter(users, { age: "[0,100]" })).toHaveLength(2);
		// bare age is still an exact numeric match
		expect(User.filter(users, { age: "17" })).toHaveLength(1);
	});
});
