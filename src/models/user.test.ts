import { describe, expect, it } from "bun:test";
import { User } from "./user";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const valid = {
	id: crypto.randomUUID(),
	name: "Alice",
	email: "alice@example.com",
	role: "member" as const,
	created_at: "2026-08-09T12:00:00.000Z",
	age: 25,
};

const another = {
	...valid,
	id: crypto.randomUUID(),
	name: "Bob",
	email: "bob@example.com",
};

// ---------------------------------------------------------------------------
// is – type guard
// ---------------------------------------------------------------------------
describe("User.is", () => {
	it("returns true for a valid user", () => {
		expect(User.is(valid)).toBe(true);
	});

	it("returns false for null / undefined", () => {
		expect(User.is(null)).toBe(false);
		expect(User.is(undefined)).toBe(false);
	});

	it("returns false for a non-object", () => {
		expect(User.is("nope")).toBe(false);
		expect(User.is(42)).toBe(false);
	});

	// --- individual field guards -------------------------------------------
	describe("id", () => {
		it("rejects missing id", () => {
			const { id: _, ...rest } = valid;
			expect(User.is(rest)).toBe(false);
		});

		it("rejects non-uuid id", () => {
			expect(User.is({ ...valid, id: "not-a-uuid" })).toBe(false);
		});

		it("rejects empty string id", () => {
			expect(User.is({ ...valid, id: "" })).toBe(false);
		});
	});

	describe("name", () => {
		it("rejects empty name", () => {
			expect(User.is({ ...valid, name: "" })).toBe(false);
		});

		it("rejects missing name", () => {
			const { name: _, ...rest } = valid;
			expect(User.is(rest)).toBe(false);
		});

		it("rejects name > 100 chars", () => {
			expect(User.is({ ...valid, name: "a".repeat(101) })).toBe(false);
		});
	});

	describe("email", () => {
		it("rejects invalid email format", () => {
			expect(User.is({ ...valid, email: "not-an-email" })).toBe(false);
		});

		it("rejects email > 255 chars", () => {
			const longLocal = "a".repeat(240);
			expect(
				User.is({
					...valid,
					email: `${longLocal}@exceedstotalength.com`,
				}),
			).toBe(false);
		});
	});

	describe("role", () => {
		it("rejects unknown role", () => {
			expect(User.is({ ...valid, role: "superadmin" })).toBe(false);
		});

		it("accepts all valid roles", () => {
			for (const role of ["admin", "member", "viewer"] as const) {
				expect(User.is({ ...valid, role })).toBe(true);
			}
		});
	});

	describe("age", () => {
		it("rejects age < 20 (exclusive minimum 19)", () => {
			expect(User.is({ ...valid, age: 19 })).toBe(false);
			expect(User.is({ ...valid, age: 0 })).toBe(false);
		});

		it("rejects age > 100", () => {
			expect(User.is({ ...valid, age: 101 })).toBe(false);
		});

		it("rejects negative age", () => {
			expect(User.is({ ...valid, age: -1 })).toBe(false);
		});

		it("rejects float age (uint32)", () => {
			expect(User.is({ ...valid, age: 25.5 })).toBe(false);
		});

		it("accepts boundary 20 and 100", () => {
			expect(User.is({ ...valid, age: 20 })).toBe(true);
			expect(User.is({ ...valid, age: 100 })).toBe(true);
		});
	});

	describe("created_at", () => {
		it("rejects non-ISO datetime", () => {
			expect(User.is({ ...valid, created_at: "2026-08-09" })).toBe(false);
			expect(User.is({ ...valid, created_at: "not-a-date" })).toBe(false);
		});
	});
});

// ---------------------------------------------------------------------------
// validate – structured error output
// ---------------------------------------------------------------------------
describe("User.validate", () => {
	it("returns success with data for a valid user", () => {
		const result = User.validate(valid);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.id).toBe(valid.id);
		}
	});

	it("returns failure with errors for an invalid user", () => {
		const result = User.validate({});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.errors.length).toBeGreaterThan(0);
		}
	});
});

// ---------------------------------------------------------------------------
// assert – throws on invalid
// ---------------------------------------------------------------------------
describe("User.assert", () => {
	it("does not throw for a valid user", () => {
		expect(() => User.assert(valid)).not.toThrow();
	});

	it("throws for an invalid user", () => {
		expect(() => User.assert({})).toThrow();
	});
});

// ---------------------------------------------------------------------------
// clone – deep copy that strips extra fields, throws on invalid
// ---------------------------------------------------------------------------
describe("User.clone", () => {
	it("returns a different object reference", () => {
		const cloned = User.clone(valid);
		expect(cloned).not.toBe(valid);
	});

	it("preserves all values (deep copy)", () => {
		const cloned = User.clone(valid);
		expect(cloned.id).toBe(valid.id);
		expect(cloned.name).toBe(valid.name);
		expect(cloned.email).toBe(valid.email);
		expect(cloned.role).toBe(valid.role);
		expect(cloned.age).toBe(valid.age);
		expect(cloned.created_at).toBe(valid.created_at);
	});

	it("strips extra unknown fields", () => {
		const cloned = User.clone({ ...valid, bogus: "x" } as User);
		expect("bogus" in cloned).toBe(false);
	});

	it("throws on invalid data", () => {
		expect(() => User.clone({ ...valid, age: -1 } as User)).toThrow();
	});
});

// ---------------------------------------------------------------------------
// prune – mutates in-place by stripping extra fields, throws on invalid
// ---------------------------------------------------------------------------
describe("User.prune", () => {
	it("returns the same object reference (mutates in-place)", () => {
		const withExtra = { ...valid, bogus: "x" } as User;
		const pruned = User.prune(withExtra);
		expect(pruned).toBe(withExtra);
	});

	it("strips extra unknown fields", () => {
		const withExtra = { ...valid, bogus: "x", junk: 42 } as User;
		const pruned = User.prune(withExtra);
		expect("bogus" in pruned).toBe(false);
		expect("junk" in pruned).toBe(false);
	});

	it("preserves all valid fields", () => {
		const withExtra = { ...valid, bogus: "x" } as User;
		const pruned = User.prune(withExtra);
		expect(pruned.name).toBe(valid.name);
		expect(pruned.email).toBe(valid.email);
		expect(pruned.age).toBe(valid.age);
	});

	it("throws on invalid data", () => {
		expect(() => User.prune({ ...valid, age: -1 } as User)).toThrow();
	});
});

// ---------------------------------------------------------------------------
// assertStrict – returns first arg regardless of input (type-assertion passthrough)
// ---------------------------------------------------------------------------
describe("User.assertStrict", () => {
	it("returns the first argument", () => {
		const result = User.assertStrict(valid, { ...valid });
		expect(result.id).toBe(valid.id);
	});
});

// ---------------------------------------------------------------------------
// validateStrict – validates first input (second is structural check)
// ---------------------------------------------------------------------------
describe("User.validateStrict", () => {
	it("succeeds when both are valid users (different values)", () => {
		const result = User.validateStrict(valid, another);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.id).toBe(valid.id);
		}
	});

	it("succeeds when both are identical", () => {
		const result = User.validateStrict(valid, { ...valid });
		expect(result.success).toBe(true);
	});

	it("succeeds when only first is valid (second invalid)", () => {
		const result = User.validateStrict(valid, { ...valid, age: -1 });
		expect(result.success).toBe(true);
	});

	it("fails when first is invalid", () => {
		const result = User.validateStrict({ ...valid, email: "bad" }, valid);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.errors.length).toBeGreaterThan(0);
		}
	});

	it("fails when both are invalid (reports first)", () => {
		const result = User.validateStrict(
			{ ...valid, email: "bad" },
			{ ...valid, age: -1 },
		);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.errors.some((e) => e.path.includes("email"))).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// compare (Comparable) – equals / less / more
// ---------------------------------------------------------------------------
describe("User.equals", () => {
	it("returns true for structurally identical users", () => {
		expect(User.equals(valid, { ...valid })).toBe(true);
	});

	it("returns false when a field differs (id)", () => {
		expect(User.equals(valid, { ...valid, id: crypto.randomUUID() })).toBe(
			false,
		);
	});

	it("returns false when email differs", () => {
		expect(User.equals(valid, { ...valid, email: "other@example.com" })).toBe(
			false,
		);
	});

	it("returns false when age differs", () => {
		expect(User.equals(valid, { ...valid, age: 30 })).toBe(false);
	});
});

describe("User.less", () => {
	it("returns false for equal users", () => {
		expect(User.less(valid, { ...valid })).toBe(false);
	});

	it("returns true when first id is lexicographically smaller", () => {
		const a = { ...valid, id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" };
		const b = { ...valid, id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" };
		expect(User.less(a, b)).toBe(true);
	});

	it("returns false when first id is lexicographically larger", () => {
		const a = { ...valid, id: "cccccccc-cccc-cccc-cccc-cccccccccccc" };
		const b = { ...valid, id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" };
		expect(User.less(a, b)).toBe(false);
	});

	it("compares by name when ids are equal", () => {
		expect(User.less(valid, { ...valid, name: "Zoe" })).toBe(true);
		expect(User.less({ ...valid, name: "Zoe" }, valid)).toBe(false);
	});

	it("compares by age when earlier fields are equal", () => {
		const younger = { ...valid, age: 20 };
		const older = { ...valid, age: 80 };
		expect(User.less(younger, older)).toBe(true);
		expect(User.less(older, younger)).toBe(false);
	});
});

describe("User.more", () => {
	it("returns false for equal users", () => {
		expect(User.more(valid, { ...valid })).toBe(false);
	});

	it("returns true when first id is lexicographically larger", () => {
		const a = { ...valid, id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" };
		const b = { ...valid, id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" };
		expect(User.more(a, b)).toBe(true);
	});

	it("returns false when first id is lexicographically smaller", () => {
		const a = { ...valid, id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" };
		const b = { ...valid, id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" };
		expect(User.more(a, b)).toBe(false);
	});

	it("compares by name when ids are equal", () => {
		expect(User.more({ ...valid, name: "Zoe" }, valid)).toBe(true);
		expect(User.more(valid, { ...valid, name: "Zoe" })).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// validatePartial – partial payload validation
// ---------------------------------------------------------------------------
describe("User.validatePartial", () => {
	it("accepts a single field", () => {
		const result = User.validatePartial({ name: "Charlie" });
		expect(result.success).toBe(true);
	});

	it("rejects invalid partial field", () => {
		const result = User.validatePartial({ email: "bad" });
		expect(result.success).toBe(false);
	});

	it("accepts empty object", () => {
		expect(User.validatePartial({}).success).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// toJSON / fromJSON – round-trip serialization
// ---------------------------------------------------------------------------
describe("User JSON round-trip", () => {
	it("toJSON produces JSON and fromJSON parses it back", () => {
		const json = User.toJSON(valid);
		expect(json).toBeTypeOf("string");

		const parsed = User.fromJSON(json);
		expect(parsed.id).toBe(valid.id);
		expect(parsed.email).toBe(valid.email);
	});

	it("fromJSON throws on malformed JSON", () => {
		expect(() => User.fromJSON("{bad}")).toThrow();
	});

	it("fromJSON throws on JSON with invalid fields", () => {
		expect(() =>
			User.fromJSON(JSON.stringify({ ...valid, age: 16 })),
		).toThrow();
	});
});

// ---------------------------------------------------------------------------
// encode / decode – protobuf round-trip
// ---------------------------------------------------------------------------
describe("User protobuf round-trip", () => {
	it("encodes and decodes back to the same data", () => {
		const buf = User.encode(valid);
		expect(buf).toBeInstanceOf(Uint8Array);

		const decoded = User.decode(buf);
		expect(decoded.id).toBe(valid.id);
		expect(decoded.name).toBe(valid.name);
		expect(decoded.age).toBe(valid.age);
	});
});

// ---------------------------------------------------------------------------
// message – protobuf schema string
// ---------------------------------------------------------------------------
describe("User.message", () => {
	it("returns a proto3 schema string with the User message", () => {
		const msg = User.message;
		expect(typeof msg).toBe("string");
		expect(msg).toContain("message User");
		expect(msg).toContain("proto3");
	});
});

// ---------------------------------------------------------------------------
// schema – JSON Schema object (pre-built, not a function)
// ---------------------------------------------------------------------------
describe("User.schema", () => {
	it("is a plain object with JSON Schema structure", () => {
		const { schema } = User;
		expect(typeof schema).toBe("object");
		expect(schema).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// metaSchema – reflection schema (function, non-prod only)
// ---------------------------------------------------------------------------
describe("User.metaSchema", () => {
	const metaSchema = (User as unknown as { metaSchema?: unknown }).metaSchema;

	it("is exposed in non-prod builds", () => {
		expect(metaSchema).toBeDefined();
		expect(typeof metaSchema).toBe("object");
	});

	it("describes the User shape as an IJsonSchema", () => {
		// typia.reflect.schema is transformed into a static JSON Schema object.
		expect(typeof metaSchema).toBe("object");
		const schema = metaSchema as {
			schema?: Record<string, unknown>;
			components?: Record<string, unknown>;
		};
		// The schema must reference the User type (by properties or $defs).
		const hasShape =
			schema.schema !== undefined || schema.components !== undefined;
		expect(hasShape).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// from – plain object assertion
// ---------------------------------------------------------------------------
describe("User.from", () => {
	it("returns the input data on success", () => {
		const result = User.from(valid);
		expect(result.id).toBe(valid.id);
		expect(result.name).toBe(valid.name);
	});

	it("throws on invalid data", () => {
		expect(() => User.from({ ...valid, age: 0 })).toThrow();
		expect(() => User.from({ ...valid, email: "bad" })).toThrow();
	});

	it("is() accepts a value produced by from()", () => {
		const created = User.from(valid);
		expect(User.is(created)).toBe(true);
	});

	it("instance exposes bound methods (equals, stringify, clone, validate, assert)", () => {
		const userobj = User.from(valid);
		expect(typeof userobj.equals).toBe("function");
		expect(typeof userobj.stringify).toBe("function");
		expect(typeof userobj.clone).toBe("function");
		expect(typeof userobj.validate).toBe("function");
		expect(typeof userobj.assert).toBe("function");

		expect(userobj.equals(valid)).toBe(true);
		const parsed = JSON.parse(userobj.stringify());
		expect(parsed.id).toBe(valid.id);

		const cloned = userobj.clone();
		expect(User.is(cloned)).toBe(true);
		expect(cloned).not.toBe(userobj);
	});

	it("instance JSON.stringify yields the user data (not a string)", () => {
		const userobj = User.from(valid);
		const serialized = JSON.parse(JSON.stringify(userobj));
		expect(serialized.id).toBe(valid.id);
		expect(serialized.name).toBe(valid.name);
		expect(typeof serialized.equals).toBe("undefined");
	});
});

// ---------------------------------------------------------------------------
// random — random user generator
// ---------------------------------------------------------------------------
// Note: typia's createRandom is best-effort and may not satisfy all composite
// tags (e.g. UUID format, MaxLength bounds), so we test structural shape here.
describe("User.random", () => {
	it("return objects with all User fields", () => {
		const u = User.random();
		expect(typeof u.id).toBe("string");
		expect(typeof u.name).toBe("string");
		expect(typeof u.email).toBe("string");
		expect(typeof u.created_at).toBe("string");
		expect(["admin", "member", "viewer"]).toContain(u.role);
		expect(typeof u.age).toBe("number");
		expect(Number.isInteger(u.age)).toBe(true);
	});

	it("is a valid User when id and name are fixed", () => {
		const fixed = User.random();
		fixed.id = crypto.randomUUID();
		fixed.name = "Alice";
		expect(User.is(fixed)).toBe(true);
	});

	it("generates distinct users across calls", () => {
		const a = User.random();
		const b = User.random();
		expect(a.id).not.toBe(b.id);
	});
});
