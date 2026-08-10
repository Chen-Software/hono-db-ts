import { describe, expect, it } from "bun:test";
import typia from "typia";

import { type Blake3 } from "../tags/format-string-blake3";
import {
	ContentAddressable,
	createAssertHash,
	createContentAddressing,
	hashContent,
	isContentAddressable,
	updateHash,
	validateContentAddressable,
	verifyContentAddress,
	withContentHash,
} from "./content-addressable";

// Canonical BLAKE3 of the empty string (32 bytes → 64 lowercase hex).
// Sourced from the BLAKE3 reference test vectors; proves `hashContent` is a
// genuine BLAKE3 and not a stub.
const EMPTY_BLAKE3 =
	"af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262";

// A valid 64-hex placeholder — passes the FORMAT check but is NOT the real
// hash of any specific content.
const PLACEHOLDER = "a".repeat(64);

describe("Blake3 custom tag (FORMAT-only)", () => {
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
		// hash must be FORMAT-valid; the canonical empty-string vector is.
		expect(
			validateContentAddressable({ content: "x", hash: EMPTY_BLAKE3 }).success,
		).toBe(true);
	});

	it("isContentAddressable narrows correctly", () => {
		expect(isContentAddressable({ content: "x", hash: EMPTY_BLAKE3 })).toBe(
			true,
		);
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

describe("FORMAT-only vs SEMANTIC correctness — the two layers", () => {
	// `Blake3` is purely syntactic: a well-formed string passes regardless of
	// whether it actually equals blake3(content). Semantic correctness is the
	// job of the runtime helpers (createAssertHash / updateHash /
	// verifyContentAddress), NOT of a tag.
	type FormatOnly = { hash: string & Blake3 };
	const validateFormatOnly = typia.createValidate<FormatOnly>();

	it("Format-only tag ACCEPTS a well-formed but content-wrong hash", () => {
		// EMPTY_BLAKE3 is valid 64-hex, so the format passes — even though it
		// is NOT blake3("x"). This proves Blake3 is syntactic only.
		expect(validateFormatOnly({ hash: EMPTY_BLAKE3 }).success).toBe(true);
	});

	it("Format-only tag REJECTS a malformed hash", () => {
		expect(validateFormatOnly({ hash: "not-a-hash" }).success).toBe(false);
	});

	it("verifyContentAddress REJECTS a content-wrong hash (the semantic layer)", () => {
		const addressed = withContentHash({ content: "x" }, "content");
		// addressed has the CORRECT hash for "x"; tamper with content:
		expect(
			verifyContentAddress({ ...addressed, content: "y" }, "content"),
		).toBe(false);
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

describe("withContentHash", () => {
	it("round-trips for the default content key", () => {
		const addressed = withContentHash({ content: "hello world" }, "content");
		expect(addressed.hash).toBe(hashContent("hello world"));
		expect(verifyContentAddress(addressed, "content")).toBe(true);
	});

	it("round-trips for the body key (Post-style)", () => {
		const addressed = withContentHash({ body: "post body" }, "body");
		expect(verifyContentAddress(addressed, "body")).toBe(true);
	});

	it("overwrites any incoming hash", () => {
		const addressed = withContentHash(
			{ content: "hello", hash: PLACEHOLDER },
			"content",
		);
		expect(addressed.hash).toBe(hashContent("hello"));
	});
});

describe("createAssertHash (construction-time stamping)", () => {
	const assertBody = createAssertHash("body");

	it("stamps the correct hash from the content field", () => {
		const addressed = assertBody({ body: "hello" });
		expect(addressed.hash).toBe(hashContent("hello"));
		expect(verifyContentAddress(addressed, "body")).toBe(true);
	});

	it("overwrites any caller-supplied hash (caller need not compute it)", () => {
		const addressed = assertBody({ body: "hello", hash: PLACEHOLDER });
		expect(addressed.hash).toBe(hashContent("hello"));
	});

	it("is generic over the entity shape (carries other fields through)", () => {
		const addressed = assertBody({
			id: "00000000-0000-4000-8000-000000000000",
			body: "x",
		});
		expect(addressed.id).toBe("00000000-0000-4000-8000-000000000000");
		expect(addressed.hash).toBe(hashContent("x"));
	});
});

describe("updateHash (update-time rehash)", () => {
	// Minimal model-shaped object used to exercise the generic without dragging
	// in a full class. `from` returns the data as-is so we can inspect fields.
	type Addr = {
		id: string;
		created_at: string;
		updated_at: string;
		body: string;
		hash: string;
		published?: boolean;
	};
	const addrFrom = (d: Addr): Addr => d;
	const updateAddr = updateHash("body", { from: addrFrom });

	const base: Addr = {
		id: "00000000-0000-4000-8000-000000000000",
		created_at: "2020-01-01T00:00:00.000Z",
		updated_at: "2020-01-01T00:00:00.000Z",
		body: "original",
		hash: hashContent("original"),
		published: false,
	};

	it("recomputes the hash when content changes AND bumps the version", () => {
		const next = updateAddr(base, { body: "edited" });
		expect(next.body).toBe("edited");
		expect(next.hash).toBe(hashContent("edited"));
		expect(next.id).toBe(base.id);
		expect(next.updated_at).not.toBe(base.updated_at);
		expect(verifyContentAddress(next, "body")).toBe(true);
	});

	it("recomputes the hash idempotently when content is unchanged", () => {
		const next = updateAddr(base, { published: true });
		expect(next.body).toBe("original");
		expect(next.hash).toBe(hashContent("original"));
		expect(next.published).toBe(true);
		expect(verifyContentAddress(next, "body")).toBe(true);
	});

	it("preserves id and produces a strictly-later version timestamp", () => {
		const next = updateAddr(base, { body: "x" });
		expect(next.id).toBe(base.id);
		expect(Date.parse(next.updated_at)).toBeGreaterThan(
			Date.parse(base.updated_at),
		);
	});
});

// ---------------------------------------------------------------------------
// createContentAddressing — one-mention enabler
// ---------------------------------------------------------------------------
describe("createContentAddressing(key)", () => {
	const CA = createContentAddressing("body");

	it("assertHash stamps the correct hash from the named key", () => {
		const out = CA.assertHash({ body: "hello", hash: "WRONG-INPUT" });
		expect(out.hash).toBe(hashContent("hello"));
	});

	it("updateFor is a bound update factory (key already captured)", () => {
		expect(typeof CA.updateFor).toBe("function");
		// It returns a function that, given a ctor, produces an update fn.
		// The end-to-end path is exercised by Post/User model tests.
	});

	it("updateForVersioned is the bound, versioned update factory (key captured)", () => {
		// `updateForVersioned` composes `updateHash` (version bump + rehash),
		// so it requires a `Versioned` entity. The behaviour is covered
		// end-to-end by the Post model tests and the `updateHash` block above.
		expect(typeof CA.updateForVersioned).toBe("function");
	});
});
