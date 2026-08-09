import { describe, expect, it } from "bun:test";
import typia from "typia";

import { type Blake3 } from "../tags/format-string-blake3";
import {
	ContentAddressable,
	contentAddressableUpdate,
	createContentAddressableUpdate,
	hashContent,
	isContentAddressable,
	validateContentAddressable,
	verifyContentAddress,
	withContentHash,
} from "./content-addressable";

// Canonical BLAKE3 of the empty string (32 bytes → 64 lowercase hex).
// Sourced from the BLAKE3 reference test vectors; proves `hashContent` is a
// genuine BLAKE3 and not a stub.
const EMPTY_BLAKE3 = "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262";

describe("Blake3 custom tag", () => {
	it("accepts a valid 64-char lowercase hex hash", () => {
		const validate = typia.createValidate<{ hash: string & Blake3 }>();
		expect(validate({ hash: EMPTY_BLAKE3 }).success).toBe(true);
	});

	it("rejects a hash of the wrong length", () => {
		const validate = typia.createValidate<{ hash: string & Blake3 }>();
		expect(validate({ hash: "abc" }).success).toBe(false);
	});

	it("rejects uppercase hex", () => {
		const validate = typia.createValidate<{ hash: string & Blake3 }>();
		expect(validate({ hash: EMPTY_BLAKE3.toUpperCase() }).success).toBe(false);
	});

	it("rejects non-hex characters", () => {
		const validate = typia.createValidate<{ hash: string & Blake3 }>();
		expect(validate({ hash: "g".repeat(64) }).success).toBe(false);
	});
});

describe("ContentAddressable default 'content' key", () => {
	it("requires the 'content' field (not 'body')", () => {
		expect(
			validateContentAddressable({ body: "x", hash: EMPTY_BLAKE3 }).success,
		).toBe(false);
		expect(
			validateContentAddressable({ content: "x", hash: EMPTY_BLAKE3 }).success,
		).toBe(true);
	});

	it("isContentAddressable narrows correctly", () => {
		expect(isContentAddressable({ content: "x", hash: EMPTY_BLAKE3 })).toBe(true);
		expect(isContentAddressable({ body: "x", hash: EMPTY_BLAKE3 })).toBe(false);
	});
});

describe('ContentAddressable<"body"> key (Post-style)', () => {
	it("requires 'body' and ignores 'content'", () => {
		const validate = typia.createValidate<ContentAddressable<"body">>();
		expect(validate({ content: "x", hash: EMPTY_BLAKE3 }).success).toBe(false);
		expect(validate({ body: "x", hash: EMPTY_BLAKE3 }).success).toBe(true);
	});
});

describe("hashContent", () => {
	it("matches the canonical BLAKE3 empty-string vector", () => {
		expect(hashContent("")).toBe(EMPTY_BLAKE3);
	});

	it("is deterministic", () => {
		expect(hashContent("hello")).toBe(hashContent("hello"));
	});

	it("differs for different content", () => {
		expect(hashContent("a")).not.toBe(hashContent("b"));
	});
});

describe("verifyContentAddress / withContentHash", () => {
	it("round-trips for the default content key", () => {
		const addressed = withContentHash({ content: "hello world" }, "content");
		expect(addressed.hash).toBe(hashContent("hello world"));
		expect(verifyContentAddress(addressed, "content")).toBe(true);
	});

	it("round-trips for the body key (Post-style)", () => {
		const addressed = withContentHash({ body: "post body" }, "body");
		expect(verifyContentAddress(addressed, "body")).toBe(true);
	});

	it("detects tampering with the content", () => {
		const addressed = withContentHash({ content: "safe" }, "content");
		const tampered = { ...addressed, content: "unsafe" };
		expect(verifyContentAddress(tampered, "content")).toBe(false);
	});
});

describe("contentAddressableUpdate (automatic updateContentHash)", () => {
	// Minimal model-shaped object used to exercise the generic without dragging
	// in a full class. `reconstruct` returns the plain object so we can inspect
	// the resulting fields directly.
	const base = {
		id: "00000000-0000-4000-8000-000000000000",
		created_at: "2020-01-01T00:00:00.000Z",
		updated_at: "2020-01-01T00:00:00.000Z",
		body: "original body",
		hash: hashContent("original body"),
	};
	const reconstruct = (d: any): any => ({ ...d });

	it("recomputes the hash when the content field changes", () => {
		const next = contentAddressableUpdate(base as any, { body: "edited body" }, "body", reconstruct);
		expect(next.body).toBe("edited body");
		expect(next.hash).toBe(hashContent("edited body"));
		expect(verifyContentAddress(next, "body")).toBe(true);
	});

	it("recomputes the hash even when content is unchanged (idempotent)", () => {
		const next = contentAddressableUpdate(base as any, { published: true } as any, "body", reconstruct);
		expect(next.body).toBe("original body");
		expect(next.hash).toBe(hashContent("original body"));
		expect(verifyContentAddress(next, "body")).toBe(true);
	});

	it("still bumps updated_at and preserves id (Versioned behaviour intact)", () => {
		const next = contentAddressableUpdate(base as any, { body: "x" }, "body", reconstruct);
		expect(next.id).toBe(base.id);
		expect(Date.parse(next.updated_at)).toBeGreaterThanOrEqual(Date.parse(base.updated_at));
		expect(next.updated_at).not.toBe(base.updated_at);
	});

	it("createContentAddressableUpdate binds the key + model and auto-rehashes", () => {
		const update = createContentAddressableUpdate("body", { from: reconstruct });
		const next = update(base as any, { body: "via factory" });
		expect(next.hash).toBe(hashContent("via factory"));
		expect(verifyContentAddress(next, "body")).toBe(true);
	});
});
