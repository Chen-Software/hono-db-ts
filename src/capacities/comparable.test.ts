import { describe, expect, it } from "bun:test";
import typia from "typia";
import { defineModel } from "../models/base";
import { Comparable } from "./comparable";
import type { SchemaModule } from "./schema-module";
import { Validatable } from "./validatable";

interface ComparableT {
	id: string;
	n: number;
}

/** The fixed schema module for `ComparableT` — every typia binding concretely bound,
 *  including the compare family (`equals` / `less` / `more`) the {@link Comparable}
 *  capacity pulls out of it. */
function miniModule(): SchemaModule<ComparableT> {
	const eq = typia.compare.createEquals<ComparableT>();
	const less = typia.compare.createLess<ComparableT>();
	return {
		schema: typia.reflect.schema<ComparableT>(),
		classify: typia.plain.createClassify<ComparableT>(),
		assertClassify: typia.plain.createAssertClassify<ComparableT>(),
		validateClassify: typia.plain.createValidateClassify<ComparableT>(),
		clone: typia.plain.createClone<ComparableT>(),
		assertClone: typia.plain.createAssertClone<ComparableT>(),
		isClone: typia.plain.createIsClone<ComparableT>(),
		validateClone: typia.plain.createValidateClone<ComparableT>(),
		is: typia.createIs<ComparableT>(),
		assert: typia.createAssert<ComparableT>(),
		assertGuard: typia.createAssertGuard<ComparableT>(),
		validate: typia.createValidate<ComparableT>(),
		assertEquals: typia.createAssertEquals<ComparableT>(),
		validateEquals: typia.createValidateEquals<ComparableT>(),
		assertGuardEquals: typia.createAssertGuardEquals<ComparableT>(),
		assertGuardValidate: typia.createAssertGuard<ComparableT>(),
		stringify: typia.json.createStringify<ComparableT>(),
		toJSON: typia.json.createAssertStringify<ComparableT>(),
		isStringify: typia.json.createIsStringify<ComparableT>(),
		validateStringify: typia.json.createValidateStringify<ComparableT>(),
		fromJSON: typia.json.createAssertParse<ComparableT>(),
		isParse: typia.json.createIsParse<ComparableT>(),
		validateParse: typia.json.createValidateParse<ComparableT>(),
		message: typia.protobuf.message<ComparableT>(),
		encode: typia.protobuf.createAssertEncode<ComparableT>(),
		decode: typia.protobuf.createAssertDecode<ComparableT>(),
		isEncode: typia.protobuf.createIsEncode<ComparableT>(),
		validateEncode: typia.protobuf.createValidateEncode<ComparableT>(),
		isDecode: typia.protobuf.createIsDecode<ComparableT>(),
		validateDecode: typia.protobuf.createValidateDecode<ComparableT>(),
		equals: eq,
		less,
		more: (x: any, y: any) => less(y, x),
		random: typia.createRandom<ComparableT>(),
	};
}

/** Compose a `ComparableT` model with the given capacity list. */
function makeModel(capacities: any): any {
	return defineModel<ComparableT>({
		schemaName: "ComparableT",
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
