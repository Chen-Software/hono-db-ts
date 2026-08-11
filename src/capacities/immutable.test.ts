import { describe, expect, it } from "bun:test";
import type typia from "typia";
import {
	type AssertImmutable,
	assertImmutable,
	createAssertUpdate,
	createImmutableUpdate,
	createUpdate,
	createValidateImmutableUpdate,
	createValidateUpdate,
	type IsImmutable,
	isImmutable,
} from "./immutable";

interface Doc {
	id: string;
	text: string;
}

// A trivial reconstruct that just returns the merged data as a new object.
const rebuild = (d: Doc): Doc => ({ ...d });

describe("Immutable.createUpdate (base combinator)", () => {
	const update = createUpdate(rebuild);

	it("merges patch over entity and returns a NEW object", () => {
		const a: Doc = { id: "1", text: "a" };
		const b = update(a, { text: "b" });
		expect(b).toEqual({ id: "1", text: "b" });
		expect(b).not.toBe(a); // never mutates the original
	});

	it("does not mutate the source entity", () => {
		const a: Doc = { id: "1", text: "a" };
		update(a, { text: "b" });
		expect(a.text).toBe("a");
	});
});

describe("Immutable.createAssertUpdate / createImmutableUpdate (twins)", () => {
	it("createAssertUpdate is behaviourally identical to createUpdate", () => {
		const update = createAssertUpdate(rebuild);
		const a: Doc = { id: "1", text: "a" };
		expect(update(a, { text: "z" })).toEqual({ id: "1", text: "z" });
	});

	it("createImmutableUpdate aliases createUpdate", () => {
		const update = createImmutableUpdate(rebuild);
		const a: Doc = { id: "1", text: "a" };
		expect(update(a, { text: "q" })).toEqual({ id: "1", text: "q" });
	});
});

describe("Immutable.createValidateUpdate / createValidateImmutableUpdate", () => {
	// A hand-rolled validator standing in for `typia.createValidate<Doc>()`.
	const validate = (d: Doc): typia.IValidation<Doc> => {
		if (d.text.length === 0) {
			return {
				success: false,
				errors: [{ path: "text", expected: "non-empty", value: "" }],
			};
		}
		return { success: true, data: d };
	};

	const update = createValidateUpdate(validate, rebuild);
	const updateAlias = createValidateImmutableUpdate(validate, rebuild);

	it("reconstructs when validation passes", () => {
		const a: Doc = { id: "1", text: "a" };
		expect(update(a, { text: "b" })).toEqual({ id: "1", text: "b" });
		expect(updateAlias(a, { text: "b" })).toEqual({ id: "1", text: "b" });
	});

	it("throws (with the error path) when validation fails", () => {
		const a: Doc = { id: "1", text: "a" };
		expect(() => update(a, { text: "" })).toThrow(/invalid patch/);
		expect(() => updateAlias(a, { text: "" })).toThrow(/invalid patch/);
	});
});

describe("IsImmutable (type-level readonly introspection)", () => {
	it("is true only when EVERY member is declared readonly", () => {
		// Fully readonly → true.
		const fully: IsImmutable<{ readonly x: number; readonly y: string }> = true;
		// One mutable member → false.
		const partial: IsImmutable<{ readonly x: number; y: string }> = false;
		// No readonly members → false.
		const none: IsImmutable<{ x: number; y: string }> = false;
		expect(fully).toBe(true);
		expect(partial).toBe(false);
		expect(none).toBe(false);
	});
});

describe("AssertImmutable (readonly constraint helper)", () => {
	// Compile-time-only: a fully-readonly type satisfies the constraint.
	const ok: AssertImmutable<{ readonly a: number }> = { a: 1 };
	expect(ok.a).toBe(1);
});

describe("isImmutable / assertImmutable (runtime frozen guard)", () => {
	it("isImmutable reflects Object.isFrozen", () => {
		expect(isImmutable({ x: 1 })).toBe(false);
		expect(isImmutable(Object.freeze({ x: 1 }))).toBe(true);
		expect(isImmutable(null)).toBe(false);
		expect(isImmutable("not an object")).toBe(false);
	});

	it("assertImmutable throws on a non-frozen value, passes on a frozen one", () => {
		expect(() => assertImmutable({ x: 1 })).toThrow(/not immutable/);
		expect(() => assertImmutable(Object.freeze({ x: 1 }))).not.toThrow();
	});
});
