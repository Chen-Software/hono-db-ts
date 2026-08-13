import { describe, expect, it } from "bun:test";
import typia from "typia";
import { defineModel } from "../models/base";
import type { SchemaModule } from "./schema-module";
import { Validatable, type ValidatableOptions } from "./validatable";

interface ValidatableT {
	name: string;
	age: number;
}

// Module-level typia validator bindings. Declared here (not only as properties
// of `miniModule()`) so the custom-override tests below can reference them as
// free variables: `makeModel({ validate: validateEquals })`.
const assertEquals = typia.createAssertEquals<ValidatableT>();
const validateEquals = typia.createValidateEquals<ValidatableT>();
const assertGuardEquals = typia.createAssertGuardEquals<ValidatableT>();
const assertGuardValidate = typia.createAssertGuard<ValidatableT>();

/** Build the FIXED schema module for `ValidatableT` — every typia binding concretely
 *  bound here (where `ValidatableT` is real), including all variant families. */
function miniModule(): SchemaModule<ValidatableT> {
	return {
		schema: typia.reflect.schema<ValidatableT>(),
		// plain `classify`; Validatable overrides it to `assertClassify` by default.
		classify: typia.plain.createClassify<ValidatableT>(),
		assertClassify: typia.plain.createAssertClassify<ValidatableT>(),
		validateClassify: typia.plain.createValidateClassify<ValidatableT>(),
		clone: typia.plain.createClone<ValidatableT>(),
		assertClone: typia.plain.createAssertClone<ValidatableT>(),
		isClone: typia.plain.createIsClone<ValidatableT>(),
		validateClone: typia.plain.createValidateClone<ValidatableT>(),
		is: typia.createIs<ValidatableT>(),
		assert: typia.createAssert<ValidatableT>(),
		assertGuard: typia.createAssertGuard<ValidatableT>(),
		validate: typia.createValidate<ValidatableT>(),
		assertEquals,
		validateEquals,
		assertGuardEquals,
		assertGuardValidate,
		stringify: typia.json.createStringify<ValidatableT>(),
		toJSON: typia.json.createAssertStringify<ValidatableT>(),
		isStringify: typia.json.createIsStringify<ValidatableT>(),
		validateStringify: typia.json.createValidateStringify<ValidatableT>(),
		fromJSON: typia.json.createAssertParse<ValidatableT>(),
		isParse: typia.json.createIsParse<ValidatableT>(),
		validateParse: typia.json.createValidateParse<ValidatableT>(),
		message: typia.protobuf.message<ValidatableT>(),
		encode: typia.protobuf.createAssertEncode<ValidatableT>(),
		decode: typia.protobuf.createAssertDecode<ValidatableT>(),
		isEncode: typia.protobuf.createIsEncode<ValidatableT>(),
		validateEncode: typia.protobuf.createValidateEncode<ValidatableT>(),
		isDecode: typia.protobuf.createIsDecode<ValidatableT>(),
		validateDecode: typia.protobuf.createValidateDecode<ValidatableT>(),
		equals: typia.compare.createEquals<ValidatableT>(),
		less: typia.compare.createLess<ValidatableT>(),
		more: (x: any, y: any) => typia.compare.createLess<ValidatableT>()(y, x),
		random: typia.createRandom<ValidatableT>(),
	};
}

/** Compose a `ValidatableT` model with the Validatable capacity (optionally configured). */
function makeModel(options?: ValidatableOptions): any {
	const capacities = options
		? [{ capacity: Validatable, options }]
		: [Validatable];
	return defineModel<ValidatableT>({
		schemaName: "ValidatableT",
		schemaModule: miniModule(),
		// Cast: the exact capacity-function signatures aren't directly
		// assignable to the loose `CapacityRef` union under strictFunctionTypes;
		// runtime composition is unaffected.
		capacities: capacities as any,
	}) as any;
}

const valid = { name: "x", age: 3 };
const invalid = { name: "x", age: "not-a-number" as unknown as number };
// `extra` is structurally valid for `ValidatableT` (extra props allowed by `validate`)
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
		const C = makeModel({ validate: validateEquals });
		// default `validate` would ACCEPT `extra`; the `*-equals` override REJECTS it.
		expect(C.validate(extra).success).toBe(false);
		// exactly-shaped data still passes.
		expect(C.validate(valid).success).toBe(true);
	});

	it("overrides assert to the strict-equal variant (throws on extra props)", () => {
		const C = makeModel({ assert: assertEquals });
		expect(() => C.assert(extra)).toThrow();
		expect(C.assert(valid)).toEqual(valid);
	});

	it("overrides assertGuard to the guard variant key", () => {
		const C = makeModel({ assertGuard: assertGuardValidate });
		expect(C.assertGuard(valid)).toBe(true);
		expect(C.assertGuard(invalid)).toBe(false);
	});

	it("supports the full override bundle from the request example", () => {
		const C = makeModel({
			validate: validateEquals,
			assert: assertEquals,
			assertGuard: assertGuardValidate,
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

describe("Validatable — assertGuardEquals variant", () => {
	it("swaps assertGuard to the strict-equal guard (rejects extra props)", () => {
		const C = makeModel({ assertGuard: assertGuardEquals });
		expect(C.assertGuard(valid)).toBe(true);
		expect(C.assertGuard(extra)).toBe(false); // extra prop rejected by -equals
	});
});
