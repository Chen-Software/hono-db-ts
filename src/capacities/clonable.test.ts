import { describe, expect, it } from "bun:test";
import typia from "typia";
import { defineModel } from "../models/base";
import { Clonable } from "./clonable";
import type { SchemaModule } from "./schema-module";
import { Validatable } from "./validatable";

interface ClonableT {
	name: string;
	age: number;
}

/** The fixed schema module for `ClonableT` — every typia binding concretely bound. */
function miniModule(): SchemaModule<ClonableT> {
	return {
		schema: typia.reflect.schema<ClonableT>(),
		classify: typia.plain.createClassify<ClonableT>(),
		assertClassify: typia.plain.createAssertClassify<ClonableT>(),
		validateClassify: typia.plain.createValidateClassify<ClonableT>(),
		clone: typia.plain.createClone<ClonableT>(),
		assertClone: typia.plain.createAssertClone<ClonableT>(),
		isClone: typia.plain.createIsClone<ClonableT>(),
		validateClone: typia.plain.createValidateClone<ClonableT>(),
		is: typia.createIs<ClonableT>(),
		assert: typia.createAssert<ClonableT>(),
		assertGuard: typia.createAssertGuard<ClonableT>(),
		validate: typia.createValidate<ClonableT>(),
		assertEquals: typia.createAssertEquals<ClonableT>(),
		validateEquals: typia.createValidateEquals<ClonableT>(),
		assertGuardEquals: typia.createAssertGuardEquals<ClonableT>(),
		assertGuardValidate: typia.createAssertGuard<ClonableT>(),
		stringify: typia.json.createStringify<ClonableT>(),
		toJSON: typia.json.createAssertStringify<ClonableT>(),
		isStringify: typia.json.createIsStringify<ClonableT>(),
		validateStringify: typia.json.createValidateStringify<ClonableT>(),
		fromJSON: typia.json.createAssertParse<ClonableT>(),
		isParse: typia.json.createIsParse<ClonableT>(),
		validateParse: typia.json.createValidateParse<ClonableT>(),
		message: typia.protobuf.message<ClonableT>(),
		encode: typia.protobuf.createAssertEncode<ClonableT>(),
		decode: typia.protobuf.createAssertDecode<ClonableT>(),
		isEncode: typia.protobuf.createIsEncode<ClonableT>(),
		validateEncode: typia.protobuf.createValidateEncode<ClonableT>(),
		isDecode: typia.protobuf.createIsDecode<ClonableT>(),
		validateDecode: typia.protobuf.createValidateDecode<ClonableT>(),
		equals: typia.compare.createEquals<ClonableT>(),
		less: typia.compare.createLess<ClonableT>(),
		more: (x: any, y: any) => typia.compare.createLess<ClonableT>()(y, x),
		random: typia.createRandom<ClonableT>(),
	};
}

/** Compose a `ClonableT` model with the given capacity list. */
function makeModel(capacities: any): any {
	return defineModel<ClonableT>({
		schemaName: "ClonableT",
		schemaModule: miniModule(),
		capacities,
	}) as any;
}

const data = { name: "ada", age: 36 };
const invalid = { name: "ada", age: "no" as unknown as number };

describe("Clonable — default variant", () => {
	// No Validatable → default is the plain (unvalidated) `clone`.
	const M = makeModel([Clonable]);

	it("static clone returns a deep (independent) copy", () => {
		const c = M.clone(data);
		expect(c).toEqual(data);
		c.age = 99;
		expect(data.age).toBe(36); // original untouched
	});

	it("instance clone returns a NEW instance of the same class", () => {
		const inst = new M(data);
		const cp = inst.clone();
		expect(cp).not.toBe(inst);
		expect(cp).toBeInstanceOf(M);
		expect(cp.name).toBe("ada");
	});

	it("plain clone does NOT validate, so invalid data is copied", () => {
		expect(() => M.clone(invalid)).not.toThrow();
	});
});

describe("Clonable — validator-driven default (assertClone)", () => {
	// Validatable present → default clone variant upgrades to `assertClone`.
	const M = makeModel([Validatable, Clonable]);

	it("instance clone validates by default (assertClone)", () => {
		const inst = new M(data);
		expect(inst.clone().name).toBe("ada");
	});

	it("static clone throws on invalid data (assertClone)", () => {
		expect(() => M.clone(invalid)).toThrow();
	});
});

describe("Clonable — explicit variant override", () => {
	it("honours { clone: 'clone' } even when Validatable is present", () => {
		const M = makeModel([
			Validatable,
			{ capacity: Clonable, options: { clone: "clone" } },
		]);
		expect(() => M.clone(invalid)).not.toThrow(); // opted out of validation
	});

	it("honours { clone: 'validateClone' } → returns IValidation", () => {
		const M = makeModel([
			{ capacity: Clonable, options: { clone: "validateClone" } },
		]);
		expect(M.clone(data).success).toBe(true);
		expect(M.clone(invalid).success).toBe(false);
		// instance clone returns the raw IValidation for this variant
		expect(new M(data).clone().success).toBe(true);
	});

	it("honours { clone: 'isClone' } → returns null on invalid", () => {
		const M = makeModel([
			{ capacity: Clonable, options: { clone: "isClone" } },
		]);
		expect(M.clone(data)).not.toBeNull();
		expect(M.clone(invalid)).toBeNull();
	});
});
