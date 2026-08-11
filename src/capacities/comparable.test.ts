import { describe, expect, it } from "bun:test";
import typia from "typia";
import { defineModel } from "../models/base";
import { Comparable } from "./comparable";
import type { SchemaModule } from "./schema-module";
import { Validatable } from "./validatable";

interface Mini {
	id: string;
	n: number;
}

/** The fixed schema module for `Mini` — every typia binding concretely bound,
 *  including the compare family (`equals` / `less` / `more`) the {@link Comparable}
 *  capacity pulls out of it. */
function miniModule(): SchemaModule<Mini> {
	const eq = typia.compare.createEquals<Mini>();
	const less = typia.compare.createLess<Mini>();
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
		equals: eq,
		less,
		more: (x: any, y: any) => less(y, x),
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

const valid = { id: "a", n: 1 };
const other = { id: "b", n: 2 };
// Structurally equal to each other but INVALID (n is not a number) — used to
// prove the validator-aware gate.
const invalidA = { id: "a", n: "x" as unknown as number };
const invalidB = { id: "a", n: "x" as unknown as number };

describe("Comparable — plain mode (no Validatable)", () => {
	const M = makeModel([Comparable]);

	it("exposes static equals / less / more", () => {
		expect(typeof M.equals).toBe("function");
		expect(typeof M.less).toBe("function");
		expect(typeof M.more).toBe("function");
	});

	it("equals is structural", () => {
		expect(M.equals(valid, { ...valid })).toBe(true);
		expect(M.equals(valid, other)).toBe(false);
	});

	it("less / more are inverse orderings", () => {
		expect(M.less(valid, other)).toBe(true); // 'a' < 'b'
		expect(M.more(valid, other)).toBe(false);
		expect(M.more(other, valid)).toBe(true);
	});

	it("instance methods delegate to the statics", () => {
		const inst = new M(valid);
		expect(inst.equals({ ...valid })).toBe(true);
		expect(inst.less(other)).toBe(true);
		expect(inst.more(other)).toBe(false);
	});

	it("plain compare does NOT guard on validity", () => {
		expect(M.equals(invalidA, invalidB)).toBe(true);
		expect(M.less(invalidA, other)).toBe(true); // 'a' < 'b' structurally
	});
});

describe("Comparable — validator-aware mode (Validatable present)", () => {
	const M = makeModel([Validatable, Comparable]);

	it("equals is validated by default (rejects invalid operands)", () => {
		expect(M.equals(valid, { ...valid })).toBe(true);
		expect(M.equals(invalidA, invalidB)).toBe(false);
	});

	it("less / more are ALSO validated (invalid operands rejected)", () => {
		expect(M.less(valid, other)).toBe(true);
		expect(M.more(other, valid)).toBe(true);
		expect(M.less(invalidA, other)).toBe(false);
		expect(M.more(invalidA, other)).toBe(false);
	});

	it("{ validated: false } opts out of validation even with Validatable", () => {
		const P = makeModel([
			Validatable,
			{ capacity: Comparable, options: { validated: false } },
		]);
		expect(P.equals(invalidA, invalidB)).toBe(true);
		expect(P.less(invalidA, other)).toBe(true);
	});
});
