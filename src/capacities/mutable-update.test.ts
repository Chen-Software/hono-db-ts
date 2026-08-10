import { describe, expect, it } from "bun:test";
import typia from "typia";
import { defineModel } from "../models/base";
import type { SchemaModule } from "./schema-module";
import { Validatable } from "./validatable";

interface Mini {
	name: string;
	age: number;
}

/**
 * The FIXED schema module for `Mini` — every typia binding concretely bound
 * here (where `Mini` is real), satisfying the {@link SchemaModule} contract so
 * the `Validatable` capacity can pull its validators out of it.
 */
function miniModule(): SchemaModule<Mini> {
	return {
		schema: typia.reflect.schema<Mini>(),
		classify: typia.plain.createClassify<Mini>(),
		assertClassify: typia.plain.createAssertClassify<Mini>(),
		validateClassify: typia.plain.createValidateClassify<Mini>(),
		clone: typia.plain.createClone<Mini>(),
		assertClone: typia.plain.createAssertClone<Mini>(),
		isClone: typia.plain.createIsClone<Mini>(),
		validateClone: typia.plain.createValidateClone<Mini>(),
		is: typia.createIs<Mini>(),
		assert: typia.createAssert<Mini>(),
		assertGuard: typia.createAssertGuard<Mini>(),
		validate: typia.createValidate<Mini>(),
		"assert-equals": typia.createAssertEquals<Mini>(),
		"validate-equals": typia.createValidateEquals<Mini>(),
		"assert-guard-equals": typia.createAssertGuardEquals<Mini>(),
		"assert-guard-validate": typia.createAssertGuard<Mini>(),
		stringify: typia.json.createStringify<Mini>(),
		toJSON: typia.json.createAssertStringify<Mini>(),
		isStringify: typia.json.createIsStringify<Mini>(),
		validateStringify: typia.json.createValidateStringify<Mini>(),
		fromJSON: typia.json.createAssertParse<Mini>(),
		isParse: typia.json.createIsParse<Mini>(),
		validateParse: typia.json.createValidateParse<Mini>(),
		message: typia.protobuf.message<Mini>(),
		encode: typia.protobuf.createAssertEncode<Mini>(),
		decode: typia.protobuf.createAssertDecode<Mini>(),
		isEncode: typia.protobuf.createIsEncode<Mini>(),
		validateEncode: typia.protobuf.createValidateEncode<Mini>(),
		isDecode: typia.protobuf.createIsDecode<Mini>(),
		validateDecode: typia.protobuf.createValidateDecode<Mini>(),
		random: typia.createRandom<Mini>(),
	};
}

/** Compose a `Mini` model with the given capacity list. */
function makeModel(capacities: any): any {
	return defineModel<Mini>({
		schemaName: "Mini",
		schemaModule: miniModule(),
		capacities,
	}) as any;
}

const valid = { name: "Ada", age: 36 };

describe("Mutable default — update patches IN PLACE (no Immutable capacity)", () => {
	const M = makeModel([Validatable]); // Validatable alone ⇒ mutable base

	it("returns the SAME instance reference (not a clone)", () => {
		const inst = new M(valid);
		const next = inst.update({ age: 40 });
		expect(next).toBe(inst);
	});

	it("mutates the receiver's fields directly", () => {
		const inst = new M(valid);
		inst.update({ name: "Bee" });
		expect(inst.name).toBe("Bee");
		expect(inst.age).toBe(36); // untouched sibling preserved
	});

	it("preserves fields not present in the patch", () => {
		const inst = new M(valid);
		inst.update({ age: 1 });
		expect(inst.name).toBe("Ada");
	});

	it("is NOT frozen — mutation is allowed by default", () => {
		const inst = new M(valid);
		expect(Object.isFrozen(inst)).toBe(false);
		inst.update({ age: 2 });
		expect(Object.isFrozen(inst)).toBe(false);
	});

	it("assignment via a plain data prop mutates in place (no accessor)", () => {
		const inst = new M(valid);
		inst.age = 99; // plain data property ⇒ real in-place write
		expect(inst.age).toBe(99);
	});
});

describe("Mutable default — onUpdate validation hook runs BEFORE commit", () => {
	// classify is plain (does NOT reject) so `onUpdate` is the thing that
	// enforces validity on `update()`.
	const M = makeModel([
		{
			capacity: Validatable,
			options: { classify: "classify", onUpdate: "assert" },
		},
	]);

	it("rejects an invalid patch via onUpdate and leaves `this` untouched", () => {
		const inst = new M(valid);
		expect(() => inst.update({ age: "bad" as unknown as number })).toThrow();
		expect(inst.age).toBe(36); // rejected BEFORE commit
		expect(inst.name).toBe("Ada");
	});

	it("accepts a valid patch and commits it in place", () => {
		const inst = new M(valid);
		const next = inst.update({ age: 40 });
		expect(next).toBe(inst);
		expect(inst.age).toBe(40);
	});
});

describe("Mutable default — without onUpdate, update does NOT validate", () => {
	// No `onUpdate` hook ⇒ the mutable base applies the patch verbatim.
	const M = makeModel([
		{ capacity: Validatable, options: { classify: "classify" } },
	]);

	it("applies a type-incorrect patch without throwing (no guard configured)", () => {
		const inst = new M(valid);
		expect(() =>
			inst.update({ age: "untyped" as unknown as number }),
		).not.toThrow();
		expect(inst.age).toBe("untyped"); // applied as-is (escape hatch)
	});
});
