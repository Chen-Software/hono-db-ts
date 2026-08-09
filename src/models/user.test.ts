import { describe, expect, it } from "bun:test";
import { UserModel as User } from "./user";

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
// equals – returns first arg regardless of input (type-assertion passthrough)
// ---------------------------------------------------------------------------
describe("User.equals", () => {
	it("returns the first argument", () => {
		const result = User.equals(valid, another);
		expect(result.id).toBe(valid.id);
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
// new / from – plain object assertion
// ---------------------------------------------------------------------------
describe("User.new / User.from", () => {
	it("new returns the input data on success", () => {
		const result = User.new(valid);
		expect(result.id).toBe(valid.id);
		expect(result.name).toBe(valid.name);
	});

	it("new throws on invalid data", () => {
		expect(() => User.new({ ...valid, age: 0 })).toThrow();
	});

	it("from returns the input data on success", () => {
		const result = User.from(valid);
		expect(result.id).toBe(valid.id);
	});

	it("from throws on invalid data", () => {
		expect(() => User.from({ ...valid, email: "bad" })).toThrow();
	});
});
