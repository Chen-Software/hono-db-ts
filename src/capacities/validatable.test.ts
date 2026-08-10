import typia from "typia";
import { describe, expect, it } from "bun:test";
import { defineModel } from "../models/base";
import type { SchemaModule } from "./schema-module";
import { Validatable, type ValidatableOptions } from "./validatable";

interface Mini {
	name: string;
	age: number;
}

/** Build the FIXED schema module for `Mini` — every typia binding concretely
 *  bound here (where `Mini` is real), including all variant families. */
function miniModule(): SchemaModule<Mini> {
	return {
		schema: typia.reflect.schema<Mini>(),
		// plain `classify`; Validatable overrides it to `assertClassify` by default.
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

/** Compose a `Mini` model with the Validatable capacity (optionally configured). */
function makeModel(options?: ValidatableOptions): any {
	const capacities = options
		? [{ capacity: Validatable, options }]
		: [Validatable];
	return defineModel<Mini>({
		schemaName: "Mini",
		schemaModule: miniModule(),
		// Cast: the exact capacity-function signatures aren't directly
		// assignable to the loose `CapacityRef` union under strictFunctionTypes;
		// runtime composition is unaffected.
		capacities: capacities as any,
	}) as any;
}

const valid = { name: "x", age: 3 };
const invalid = { name: "x", age: "not-a-number" as unknown as number };
// `extra` is structurally valid for `Mini` (extra props allowed by `validate`)
// but REJECTED by the strict-equal `*equals` validators — the observable
// difference that proves an override took effect.
const extra = { name: "x", age: 3, surplus: 1 };

describe("Validatable — default methods", () => {
	const C = makeModel();

	it("exposes validate / assert / assertGuard statics", () => {
		expect(typeof C.validate).toBe("function");
		expect(typeof C.assert).toBe("function");
		expect(typeof C.assertGuard).toBe("function");
	});

	it("validate returns success for valid data and failure for invalid", () => {
		expect(C.validate(valid).success).toBe(true);
		expect(C.validate(invalid).success).toBe(false);
	});

	it("assert returns the data for valid input and throws on invalid", () => {
		expect(C.assert(valid)).toEqual(valid);
		expect(() => C.assert(invalid)).toThrow();
	});

	it("assertGuard is a type guard (true/false)", () => {
		expect(C.assertGuard(valid)).toBe(true);
		expect(C.assertGuard(invalid)).toBe(false);
	});

	it("instance mirrors work", () => {
		const inst = new C(valid);
		expect(inst.validate().success).toBe(true);
		expect(inst.assert()).toBe(inst);
		expect(inst.assertGuard()).toBe(true);
	});
});

describe("Validatable — custom function overrides", () => {
	it("overrides validate to the strict-equal variant (rejects extra props)", () => {
		const C = makeModel({ validate: "validate-equals" });
		// default `validate` would ACCEPT `extra`; the `*-equals` override REJECTS it.
		expect(C.validate(extra).success).toBe(false);
		// exactly-shaped data still passes.
		expect(C.validate(valid).success).toBe(true);
	});

	it("overrides assert to the strict-equal variant (throws on extra props)", () => {
		const C = makeModel({ assert: "assert-equals" });
		expect(() => C.assert(extra)).toThrow();
		expect(C.assert(valid)).toEqual(valid);
	});

	it("overrides assertGuard to the guard variant key", () => {
		const C = makeModel({ assertGuard: "assert-guard-validate" });
		expect(C.assertGuard(valid)).toBe(true);
		expect(C.assertGuard(invalid)).toBe(false);
	});

	it("supports the full override bundle from the request example", () => {
		const C = makeModel({
			validate: "validate-equals",
			assert: "assert-equals",
			assertGuard: "assert-guard-validate",
		});
		expect(C.validate(extra).success).toBe(false);
		expect(() => C.assert(extra)).toThrow();
		expect(C.assertGuard(valid)).toBe(true);
	});
});

describe("Validatable — onUpdate lifecycle hook", () => {
	it("is opt-in: validateUpdate is a no-op when onUpdate is unset", () => {
		const C = makeModel();
		expect(() => C.validateUpdate(invalid)).not.toThrow();
	});

	it("assertUpdate throws on invalid and is a no-op on valid when onUpdate:'assert'", () => {
		const C = makeModel({ onUpdate: "assert" });
		expect(() => C.assertUpdate(invalid)).toThrow();
		expect(() => C.assertUpdate(valid)).not.toThrow();
	});

	it("validateUpdate throws (aggregated) on invalid when onUpdate:'validate'", () => {
		const C = makeModel({ onUpdate: "validate" });
		let threw = false;
		try {
			C.validateUpdate(invalid);
		} catch (e) {
			threw = true;
			expect((e as Error).message).toContain("validation failed");
		}
		expect(threw).toBe(true);
		expect(() => C.validateUpdate(valid)).not.toThrow();
	});

	it("assertGuardUpdate enforces (throws) on invalid when onUpdate:'assertGuard'", () => {
		const C = makeModel({ onUpdate: "assertGuard" });
		expect(() => C.assertGuardUpdate(invalid)).toThrow();
		expect(() => C.assertGuardUpdate(valid)).not.toThrow();
	});
});

describe("Validatable — onNew lifecycle hook", () => {
	it("registers the Validatable capacity and constructs valid data", () => {
		const C = makeModel({ onNew: "assert" });
		const inst = new C(valid);
		expect(inst.name).toBe("x");
	});

	it("still rejects invalid construction (base classify asserts; hook reinforces)", () => {
		const C = makeModel({ onNew: "validate" });
		expect(() => new C(invalid)).toThrow();
	});
});

describe("Validatable — construction-time classify override", () => {
	it("defaults to assertClassify: construction validates WITHOUT an onNew hook", () => {
		const C = makeModel(); // no onNew, but Validatable present
		expect(() => new C(invalid)).toThrow(); // assertClassify throws
		const inst = new C(valid);
		expect(inst.age).toBe(3);
	});

	it("exposes the overridden static classify (assertClassify by default)", () => {
		const C = makeModel();
		expect(() => (C as any).classify(invalid)).toThrow();
		expect((C as any).classify(valid)).toEqual(valid);
	});

	it("honours classify:'classify' to DISABLE construction validation", () => {
		const C = makeModel({ classify: "classify" });
		// plain createClassify does not throw, so invalid data slips through.
		expect(() => new C(invalid)).not.toThrow();
		expect((C as any).classify(valid)).toEqual(valid);
	});

	it("honours classify:'validateClassify' (collects errors, unwrapped for construction)", () => {
		const C = makeModel({ classify: "validateClassify" });
		// validateClassify is unwrapped by Validatable: returns the data on
		// success, throws on failure (so the constructor can use it directly).
		expect((C as any).classify(valid)).toEqual(valid);
		expect(() => (C as any).classify(invalid)).toThrow();
		// and construction still rejects via the thrown aggregation
		expect(() => new C(invalid)).toThrow();
	});
});

describe("Validatable — assert-guard-equals variant", () => {
	it("swaps assertGuard to the strict-equal guard (rejects extra props)", () => {
		const C = makeModel({ assertGuard: "assert-guard-equals" });
		expect(C.assertGuard(valid)).toBe(true);
		expect(C.assertGuard(extra)).toBe(false); // extra prop rejected by -equals
	});
});
