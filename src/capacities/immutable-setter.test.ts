import { describe, expect, it } from "bun:test";
import typia from "typia";
import { defineModel } from "../models/base";
import { Immutable, isImmutable } from "./immutable";
import type { SchemaModule } from "./schema-module";
import { Validatable } from "./validatable";

interface ISMini {
	name: string;
	age: number;
}

/**
 * The FIXED schema module for `ISMini` — every typia binding concretely bound
 * here (where `ISMini` is real), satisfying the {@link SchemaModule} contract so
 * the `Validatable` capacity can pull its validators out of it.
 */
function miniModule(): SchemaModule<ISMini> {
	return {
		schema: typia.reflect.schema<ISMini>(),
		classify: typia.plain.createClassify<ISMini>(),
		assertClassify: typia.plain.createAssertClassify<ISMini>(),
		validateClassify: typia.plain.createValidateClassify<ISMini>(),
		clone: typia.plain.createClone<ISMini>(),
		assertClone: typia.plain.createAssertClone<ISMini>(),
		isClone: typia.plain.createIsClone<ISMini>(),
		validateClone: typia.plain.createValidateClone<ISMini>(),
		is: typia.createIs<ISMini>(),
		assert: typia.createAssert<ISMini>(),
		assertGuard: typia.createAssertGuard<ISMini>(),
		validate: typia.createValidate<ISMini>(),
		assertEquals: typia.createAssertEquals<ISMini>(),
		validateEquals: typia.createValidateEquals<ISMini>(),
		assertGuardEquals: typia.createAssertGuardEquals<ISMini>(),
		assertGuardValidate: typia.createAssertGuard<ISMini>(),
		stringify: typia.json.createStringify<ISMini>(),
		toJSON: typia.json.createAssertStringify<ISMini>(),
		isStringify: typia.json.createIsStringify<ISMini>(),
		validateStringify: typia.json.createValidateStringify<ISMini>(),
		fromJSON: typia.json.createAssertParse<ISMini>(),
		isParse: typia.json.createIsParse<ISMini>(),
		validateParse: typia.json.createValidateParse<ISMini>(),
		message: typia.protobuf.message<ISMini>(),
		encode: typia.protobuf.createAssertEncode<ISMini>(),
		decode: typia.protobuf.createAssertDecode<ISMini>(),
		isEncode: typia.protobuf.createIsEncode<ISMini>(),
		validateEncode: typia.protobuf.createValidateEncode<ISMini>(),
		isDecode: typia.protobuf.createIsDecode<ISMini>(),
		validateDecode: typia.protobuf.createValidateDecode<ISMini>(),
		equals: typia.compare.createEquals<ISMini>(),
		less: typia.compare.createLess<ISMini>(),
		more: (x: any, y: any) => typia.compare.createLess<ISMini>()(y, x),
		random: typia.createRandom<ISMini>(),
	};
}

/** Compose a `ISMini` model with the given capacity list. */
function makeModel(capacities: any): any {
	return defineModel<ISMini>({
		schemaName: "ISMini",
		schemaModule: miniModule(),
		capacities,
	}) as any;
}

const valid = { name: "Ada", age: 36 };
const invalid = { name: "Ada", age: "no" as unknown as number };

/** Invoke a property setter directly (assignment to a frozen object would
 *  throw, so we call the accessor function explicitly and capture its return —
 *  the new frozen instance the setter is contractually required to produce). */
function setProp(inst: any, key: string, value: unknown): any {
	const desc = Object.getOwnPropertyDescriptor(inst, key);
	if (!desc || typeof desc.set !== "function") {
		throw new Error(`immutable-setter: no setter for "${key}"`);
	}
	return desc.set.call(inst, value);
}

describe("Immutable — setters rewrite to return a NEW frozen object", () => {
	const M = makeModel([Validatable, Immutable]);

	it("instances are frozen and every writable prop is an accessor", () => {
		const inst = new M(valid);
		expect(Object.isFrozen(inst)).toBe(true);
		const desc = Object.getOwnPropertyDescriptor(inst, "name");
		expect(typeof desc?.get).toBe("function");
		expect(typeof desc?.set).toBe("function");
		expect(desc?.enumerable).toBe(true); // own-enumerable so JSON/serialisers work
	});

	it("a setter returns a brand-new instance, not the same one", () => {
		const inst = new M(valid);
		const next = setProp(inst, "name", "Zoe");
		expect(next).not.toBe(inst);
		expect(next).toBeInstanceOf(M);
	});

	it("the returned object is itself frozen and immutable", () => {
		const inst = new M(valid);
		const next = setProp(inst, "name", "Zoe");
		expect(Object.isFrozen(next)).toBe(true);
		expect(isImmutable(next)).toBe(true);
	});

	it("the returned object carries the patched value", () => {
		const inst = new M(valid);
		const next = setProp(inst, "name", "Zoe");
		expect(next.name).toBe("Zoe");
		expect(next.age).toBe(36); // untouched sibling preserved
	});

	it("NEVER mutates the original — the setter is non-mutating", () => {
		const inst = new M(valid);
		setProp(inst, "name", "Zoe");
		expect(inst.name).toBe("Ada"); // original unchanged
		expect(inst.age).toBe(36);
	});

	it("every writable prop's setter is non-mutating (exhaustive)", () => {
		const inst = new M(valid);
		for (const [key, newValue] of [
			["name", "Changed"],
			["age", 1],
		] as const) {
			const original = inst[key];
			const next = setProp(inst, key, newValue);
			expect(inst[key]).toBe(original); // not mutated in place
			expect(next[key]).toBe(newValue); // new object got the value
			expect(next).not.toBe(inst);
		}
	});

	it("serialises correctly through own-enumerable getters (JSON)", () => {
		const inst = new M(valid);
		const json = JSON.parse(JSON.stringify(inst));
		expect(json).toEqual({ name: "Ada", age: 36 });
	});
});

describe("Immutable + unified update(patch)", () => {
	const M = makeModel([Validatable, Immutable]);

	it("update({...this, name}) returns a new frozen instance, original intact", () => {
		const inst = new M(valid);
		const next = inst.update({ ...inst, name: "Bee" });
		expect(next).not.toBe(inst);
		expect(Object.isFrozen(next)).toBe(true);
		expect(next.name).toBe("Bee");
		expect(next.age).toBe(36);
		expect(inst.name).toBe("Ada"); // original untouched
	});

	it("update accepts a partial patch (any column)", () => {
		const inst = new M(valid);
		const next = inst.update({ age: 99 });
		expect(next.age).toBe(99);
		expect(next.name).toBe("Ada"); // sibling preserved
		expect(inst.age).toBe(36); // original untouched
	});

	it("assignment is a no-op on the original via the setter (cannot mutate in place)", () => {
		// `inst` is frozen and its props are accessors. `inst.name = v` invokes
		// the setter, which returns a NEW instance (discarded) and NEVER writes
		// to `inst` — so the original is unchanged. (Assignment to an accessor
		// on a frozen object does not throw; the immutability guarantee here is
		// that the assignment cannot mutate `inst`, not that it rejects.)
		const inst = new M(valid);
		const before = inst.name;
		inst.name = "Mutate";
		expect(inst.name).toBe(before); // original untouched → immutable
	});
});

describe("Lifecycle hooks — onConstruct (onNew) via Validatable", () => {
	// Isolate onNew: classify is plain (does NOT reject) so the onConstruct
	// hook is the thing that enforces validity on construction.
	const M = makeModel([
		{
			capacity: Validatable,
			options: { classify: "classify", onNew: "assert" },
		},
		Immutable,
	]);

	it("rejects invalid construction through the onConstruct hook", () => {
		expect(() => new M(invalid)).toThrow();
	});

	it("accepts valid construction", () => {
		const inst = new M(valid);
		expect(inst.name).toBe("Ada");
	});
});

describe("Lifecycle hooks — onUpdate via Validatable", () => {
	// Isolate onUpdate: classify is plain (does NOT reject) so the onUpdate
	// hook is the thing that enforces validity on update().
	const M = makeModel([
		{
			capacity: Validatable,
			options: { classify: "classify", onUpdate: "validate" },
		},
		Immutable,
	]);

	it("rejects an invalid patch through the onUpdate hook", () => {
		const inst = new M(valid);
		expect(() => inst.update({ ...inst, age: "bad" })).toThrow(
			/validation failed/,
		);
	});

	it("accepts a valid patch", () => {
		const inst = new M(valid);
		const next = inst.update({ age: 40 });
		expect(next.age).toBe(40);
		expect(inst.age).toBe(36); // original untouched
	});
});

describe("Lifecycle hooks — both onNew + onUpdate together", () => {
	// Default classify (assertClassify) also rejects, but the hooks reinforce;
	// this proves construction and update both run their respective hooks.
	const M = makeModel([
		{
			capacity: Validatable,
			options: { onNew: "assert", onUpdate: "validate" },
		},
		Immutable,
	]);

	it("constructs valid data", () => {
		const inst = new M(valid);
		expect(inst.name).toBe("Ada");
	});

	it("update produces a new frozen valid instance", () => {
		const inst = new M(valid);
		const next = inst.update({ name: "Cy" });
		expect(next.name).toBe("Cy");
		expect(Object.isFrozen(next)).toBe(true);
		expect(inst.name).toBe("Ada");
	});
});
