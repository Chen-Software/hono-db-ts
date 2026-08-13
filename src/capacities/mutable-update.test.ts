import { describe, expect, it } from "bun:test";
import typia from "typia";
import { defineModel } from "../models/base";
import type { SchemaModule } from "./schema-module";
import { Validatable } from "./validatable";

interface MUMini {
	name: string;
	age: number;
}

/**
 * The FIXED schema module for `MUMini` — every typia binding concretely bound
 * here (where `MUMini` is real), satisfying the {@link SchemaModule} contract so
 * the `Validatable` capacity can pull its validators out of it.
 */
function miniModule(): SchemaModule<MUMini> {
	return {
		schema: typia.reflect.schema<MUMini>(),
		classify: typia.plain.createClassify<MUMini>(),
		assertClassify: typia.plain.createAssertClassify<MUMini>(),
		validateClassify: typia.plain.createValidateClassify<MUMini>(),
		clone: typia.plain.createClone<MUMini>(),
		assertClone: typia.plain.createAssertClone<MUMini>(),
		isClone: typia.plain.createIsClone<MUMini>(),
		validateClone: typia.plain.createValidateClone<MUMini>(),
		is: typia.createIs<MUMini>(),
		assert: typia.createAssert<MUMini>(),
		assertGuard: typia.createAssertGuard<MUMini>(),
		validate: typia.createValidate<MUMini>(),
		assertEquals: typia.createAssertEquals<MUMini>(),
		validateEquals: typia.createValidateEquals<MUMini>(),
		assertGuardEquals: typia.createAssertGuardEquals<MUMini>(),
		assertGuardValidate: typia.createAssertGuard<MUMini>(),
		stringify: typia.json.createStringify<MUMini>(),
		toJSON: typia.json.createAssertStringify<MUMini>(),
		isStringify: typia.json.createIsStringify<MUMini>(),
		validateStringify: typia.json.createValidateStringify<MUMini>(),
		fromJSON: typia.json.createAssertParse<MUMini>(),
		isParse: typia.json.createIsParse<MUMini>(),
		validateParse: typia.json.createValidateParse<MUMini>(),
		message: typia.protobuf.message<MUMini>(),
		encode: typia.protobuf.createAssertEncode<MUMini>(),
		decode: typia.protobuf.createAssertDecode<MUMini>(),
		isEncode: typia.protobuf.createIsEncode<MUMini>(),
		validateEncode: typia.protobuf.createValidateEncode<MUMini>(),
		isDecode: typia.protobuf.createIsDecode<MUMini>(),
		validateDecode: typia.protobuf.createValidateDecode<MUMini>(),
		random: typia.createRandom<MUMini>(),
	};
}

/** Compose a `MUMini` model with the given capacity list. */
function makeModel(capacities: any): any {
	return defineModel<MUMini>({
		schemaName: "MUMini",
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
