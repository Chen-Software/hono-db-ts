import typia from "typia";
import { describe, expect, it } from "bun:test";
import { defineModel } from "../models/base";
import type { SchemaModule } from "./schema-module";
import { Validatable } from "./validatable";
import { Clonable } from "./clonable";

interface Mini {
	name: string;
	age: number;
}

/** The fixed schema module for `Mini` — every typia binding concretely bound. */
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
		equals: typia.compare.createEquals<Mini>(),
		less: typia.compare.createLess<Mini>(),
		more: (x: any, y: any) => typia.compare.createLess<Mini>()(y, x),
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
