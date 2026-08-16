import { describe, expect, it } from "bun:test";
import { Repository } from "../models/repository";
import { User } from "../models/user";

/** Build a valid Repository instance from raw data (mirrors seed.ts stamping). */
function makeRepo(overrides: Record<string, any> = {}): Record<string, any> {
	return Repository.from({
		id: crypto.randomUUID(),
		ownerId: null,
		name: "my-repo",
		lowerName: "my-repo",
		description: "a repository",
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
		size: 0,
		avatar: "",
		status: 0,
		created_at: "2026-08-09T12:00:00.000Z",
		updated_at: "2026-08-09T12:00:00.000Z",
		...overrides,
	}) as unknown as Record<string, any>;
}

describe("Queriable — schema-inferred matching (Repository)", () => {
	const repos = [
		makeRepo({
			isPrivate: true,
			name: "Hello World",
			created_at: "1998-01-01T00:00:00.000Z",
		}),
		makeRepo({
			isPrivate: false,
			name: "Deep dive",
			created_at: "2005-06-15T00:00:00.000Z",
		}),
		makeRepo({
			isPrivate: true,
			name: "Getting started",
			created_at: "2026-08-09T00:00:00.000Z",
		}),
	];

	it("infers boolean equality for `isPrivate`", () => {
		expect(Repository.filter(repos as any, { isPrivate: "true" })).toHaveLength(2);
		expect(Repository.filter(repos as any, { isPrivate: "false" })).toHaveLength(1);
	});

	it("infers substring for `name`", () => {
		expect(Repository.filter(repos as any, { name: "deep" })).toHaveLength(1);
	});

	it("infers closed date RANGE for `created_at` via [min,max] tuple", () => {
		const r = Repository.filter(repos as any, {
			created_at: "[2000-01-01,2027-01-01]",
		});
		expect(r).toHaveLength(2); // 2005, 2026
	});

	it("bare date value is an EXACT (day-level) match, not a range", () => {
		expect(
			Repository.filter(repos as any, { created_at: "1998-01-01" }),
		).toHaveLength(1);
		// without brackets it is NOT a range
		expect(
			Repository.filter(repos as any, { created_at: "1998-01-01,2099-01-01" }),
		).toHaveLength(0);
	});

	it("ignores unknown params (permissive)", () => {
		expect(Repository.filter(repos as any, { notAField: "x" })).toHaveLength(3);
	});

	it("applies `limit`", () => {
		expect(Repository.filter(repos as any, { limit: "2" })).toHaveLength(2);
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
