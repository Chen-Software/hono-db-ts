import { describe, expect, it } from "bun:test";
import { hashContent, verifyContentAddress } from "../capacities/hashable";
import { createVersionableUpdate } from "../capacities/versionable";
import { Post } from "./post";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
// A valid 64-hex placeholder hash. The model's constructor (`Post.from` →
// `createAssertHash`) recomputes the REAL hash from `body`, so this value only
// needs to satisfy the `Sha256` FORMAT check at the input boundary.
const HASH_PLACEHOLDER = "a".repeat(64);

const authorData = {
	id: crypto.randomUUID(),
	name: "Alice",
	email: "alice@example.com",
	role: "member" as const,
	created_at: "2026-08-09T12:00:00.000Z",
	age: 25,
	updated_at: "2026-08-09T12:00:00.000Z",
};

const valid = {
	id: crypto.randomUUID(),
	title: "Hello, world",
	body: "This is the post body.",
	author: authorData,
	authorId: authorData.id,
	published: false,
	created_at: "2026-08-09T12:00:00.000Z",
	updated_at: "2026-08-09T12:00:00.000Z",
	contentHash: HASH_PLACEHOLDER,
};

// ---------------------------------------------------------------------------
// Capacities — composed identically to User
// ---------------------------------------------------------------------------
describe("Post capacities (Identifiable + Timestamped + Versionable)", () => {
	it("Identifiable: requires a uuid id", () => {
		expect(Post.is(valid)).toBe(true);
		expect(Post.is({ ...valid, id: "not-a-uuid" })).toBe(false);
		expect(Post.is({ ...valid, id: "" })).toBe(false);
	});

	it("Timestamped: requires a created_at datetime", () => {
		expect(Post.is({ ...valid, created_at: "2026-08-09" })).toBe(false);
		expect(Post.is({ ...valid, created_at: "nope" })).toBe(false);
	});

	it("Versionable: requires an updated_at, equal to created_at on creation", () => {
		const p = Post.from(valid);
		expect(p.updated_at).toBe(p.created_at);
		// ISO-8601 strings of fixed length sort chronologically as text.
		expect(p.updated_at >= p.created_at).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// author: User — nested relation + nested validation
// ---------------------------------------------------------------------------
describe("Post.author (nested User)", () => {
	it("rejects a post with a missing author", () => {
		const { author: _drop, ...rest } = valid;
		expect(Post.is(rest)).toBe(false);
	});

	it("rejects a post whose author fails User validation", () => {
		// author.id is not a uuid -> the nested User validation fails too.
		expect(Post.is({ ...valid, author: { ...authorData, id: "bad" } })).toBe(
			false,
		);
		// author missing a required field (name) also fails.
		const { name: _drop, ...badAuthor } = authorData;
		expect(Post.is({ ...valid, author: badAuthor })).toBe(false);
	});

	it("accepts a plain (non-instance) author payload, too", () => {
		const p = Post.from(valid);
		expect(Post.is(p)).toBe(true);
		expect(p.author.id).toBe(authorData.id);
	});
});

// ---------------------------------------------------------------------------
// from / validate / assert
// ---------------------------------------------------------------------------
describe("Post.from / validate / assert", () => {
	it("from returns an instance and is() accepts it", () => {
		const p = Post.from(valid);
		expect(p.title).toBe(valid.title);
		expect(Post.is(p)).toBe(true);
	});

	it("assert throws on invalid data", () => {
		expect(() => Post.assert({ ...valid, title: "" })).toThrow();
		expect(() => Post.assert({ ...valid, body: "" })).toThrow();
	});

	it("validate returns structured errors for an invalid post", () => {
		const result = Post.validate({ ...valid, title: "x".repeat(201) });
		expect(result.success).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// update — immutable modify via the shared Versionable capacity
// ---------------------------------------------------------------------------
describe("Post.update (Versionable capacity)", () => {
	const isLater = (a: string, b: string) => a > b;

	it("returns a new object reference (does not mutate the receiver)", () => {
		const p = Post.from(valid);
		const next = p.update({ title: "Revised" });
		expect(next).not.toBe(p);
		expect(p.title).toBe("Hello, world");
	});

	it("retains the same id", () => {
		const p = Post.from(valid);
		expect(p.update({ published: true }).id).toBe(p.id);
	});

	it("stamps a strictly-later updated_at (the version)", () => {
		const p = Post.from(valid);
		const next = p.update({ body: "edited" });
		expect(next.updated_at).not.toBe(p.updated_at);
		expect(isLater(next.updated_at, p.updated_at)).toBe(true);
	});

	it("applies the patched fields and preserves the rest (incl. author)", () => {
		const p = Post.from(valid);
		const next = p.update({ title: "New title", published: true });
		expect(next.title).toBe("New title");
		expect(next.published).toBe(true);
		expect(next.body).toBe(valid.body);
		expect(next.created_at).toBe(valid.created_at);
		expect(next.author.id).toBe(authorData.id);
	});

	it("ignores any id/updated_at supplied in the patch", () => {
		const p = Post.from(valid);
		const patched = p.update({
			id: crypto.randomUUID(),
			updated_at: "1970-01-01T00:00:00.000Z",
			title: "X",
		});
		expect(patched.id).toBe(p.id);
		expect(isLater(patched.updated_at, p.updated_at)).toBe(true);
		expect(patched.title).toBe("X");
	});

	it("throws when the patched result is invalid", () => {
		const p = Post.from(valid);
		expect(() => p.update({ title: "" })).toThrow();
	});
});

// ---------------------------------------------------------------------------
// createVersionableUpdate(Post) factory — the typia.createAssert-style reusable update
// ---------------------------------------------------------------------------
describe("createVersionableUpdate(Post) factory", () => {
	const updatePost = createVersionableUpdate((d) => Post.from(d));
	const isLater = (a: string, b: string) => a > b;

	it("produces a new instance with the same id and a later version", () => {
		const p = Post.from(valid);
		const next = updatePost(p, { title: "Via factory" });
		expect(next).not.toBe(p);
		expect(next.id).toBe(p.id);
		expect(isLater(next.updated_at, p.updated_at)).toBe(true);
	});

	it("is equivalent to the instance method Post#update (same data, both bumped)", () => {
		const p = Post.from(valid);
		const viaFactory = updatePost(p, { published: true, body: "f" });
		const viaMethod = p.update({ published: true, body: "f" });
		expect(viaFactory.id).toBe(viaMethod.id);
		expect(viaFactory.published).toBe(viaMethod.published);
		expect(isLater(viaFactory.updated_at, p.updated_at)).toBe(true);
		expect(isLater(viaMethod.updated_at, p.updated_at)).toBe(true);
	});

	it("ignores any id/updated_at supplied in the patch", () => {
		const p = Post.from(valid);
		const patched = updatePost(p, {
			id: crypto.randomUUID(),
			updated_at: "1970-01-01T00:00:00.000Z",
			title: "X",
		});
		expect(patched.id).toBe(p.id);
		expect(isLater(patched.updated_at, p.updated_at)).toBe(true);
	});

	it("returns the same type as the instance method (Post)", () => {
		const p = Post.from(valid);
		expect(Post.is(updatePost(p, { title: "y" }))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// content addressing (Hashable capacity — construction + update)
// ---------------------------------------------------------------------------
describe("Post content addressing (Hashable capacity)", () => {
	it("constructor stamps the correct hash from body (overwriting any input)", () => {
		const p = Post.from({ ...valid, contentHash: "a".repeat(64) });
		// The stored `contentHash` field and the recomputed `hash()` method agree.
		expect(p.contentHash).toBe(hashContent(p.body));
		expect(p.hash()).toBe(hashContent(p.body));
		expect(verifyContentAddress(p, "body")).toBe(true);
	});

	it("update recomputes the hash when body changes (address follows content)", () => {
		const p = Post.from(valid);
		const next = p.update({ body: "edited body" });
		expect(next.body).toBe("edited body");
		expect(next.contentHash).toBe(hashContent("edited body"));
		expect(next.hash()).toBe(hashContent("edited body"));
		expect(verifyContentAddress(next, "body")).toBe(true);
		// the previous version's hash is unchanged (immutability).
		expect(p.contentHash).toBe(hashContent(valid.body));
	});

	it("hash is idempotent when body is unchanged on update", () => {
		const p = Post.from(valid);
		const next = p.update({ title: "new title" });
		expect(next.contentHash).toBe(hashContent(valid.body));
		expect(verifyContentAddress(next, "body")).toBe(true);
	});

	it("tampering with body after construction is detected", () => {
		const p = Post.from(valid);
		const tampered = { ...p, body: "mutated" } as Post;
		expect(verifyContentAddress(tampered, "body")).toBe(false);
	});

	it("post.address() returns the stored content hash", () => {
		const p = Post.from(valid);
		expect(p.address()).toBe(p.contentHash);
		expect(p.verify()).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// latestOf / history tooling (Versionable capacity)
// `Post` inherits `latestOf`/`isNewerThan`/`compareVersions`/`nextUpdatedAt`
// from the Versionable capacity — no manual `declare` required.
// ---------------------------------------------------------------------------
describe("Post.latestOf / history tooling (Versionable capacity)", () => {
	const chain = () => {
		const v1 = Post.from(valid);
		const v2 = v1.update({ title: "v2" });
		const v3 = v2.update({ title: "v3" });
		return [v1, v2, v3] as const;
	};

	it("Post.latestOf(history) returns the version with the greatest updated_at", () => {
		const [v1, v2, v3] = chain();
		// shuffle order to prove it's not positional.
		const latest = Post.latestOf([v3, v1, v2]);
		expect(latest.id).toBe(v1.id);
		expect(latest.title).toBe("v3");
		expect(latest.updated_at >= v1.updated_at).toBe(true);
		expect(latest.updated_at >= v2.updated_at).toBe(true);
	});

	it("post.latestOf(history) — the instance method — also returns the newest", () => {
		const [v1, v2, v3] = chain();
		const latest = v1.latestOf([v3, v1, v2]);
		expect(latest.title).toBe("v3");
		expect(latest.updated_at).toBe(v3.updated_at);
	});

	it("every version shares one id (append-only history of a single entity)", () => {
		const [v1, v2, v3] = chain();
		expect(v1.id).toBe(v2.id);
		expect(v2.id).toBe(v3.id);
	});

	it("isNewerThan / compareVersions reason about versions", () => {
		const [v1, v2] = chain();
		expect(v2.isNewerThan(v1)).toBe(true);
		expect(v1.isNewerThan(v2)).toBe(false);
		expect(v2.compareVersions(v1)).toBe(1);
		expect(v1.compareVersions(v2)).toBe(-1);
		// the static toolkit agrees.
		expect(Post.compareVersions(v2, v1)).toBe(1);
		expect(Post.isNewerThan(v2, v1)).toBe(true);
	});

	it("nextUpdatedAt is strictly later than the current version timestamp", () => {
		const [v1] = chain();
		expect(v1.nextUpdatedAt()).toBeGreaterThan(Date.parse(v1.updated_at));
	});
});
