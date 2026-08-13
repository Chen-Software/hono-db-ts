import { describe, expect, it } from "bun:test";
import typia from "typia";
import { defineModel } from "../models/base";
import { Immutable } from "./immutable";
import type { SchemaModule } from "./schema-module";
import { Validatable } from "./validatable";

// ---------------------------------------------------------------------------
// Two fixtures:
//   IVMini — plain mutable fields, used to prove Immutable + Validatable cooperate
//          correctly on `update` (valid ⇒ new frozen object; invalid ⇒ none).
//   Doc  — has a `readonly id` (TS-only modifier) plus mutable fields, used to
//          prove an UNVALIDATED Immutable still lets you write "illegal" values
//          (readonly override, wrong type, non-existent prop) and produces a new
//          unvalidated object.
// ---------------------------------------------------------------------------

interface IVMini {
	name: string;
	age: number;
}

interface Doc {
	readonly id: string;
	name: string;
	age: number;
}

/** Build the FULL schema module for a concrete type (typia must bind at the
 *  model site — it cannot resolve a generic argument inside a helper). */
function miniModule(): SchemaModule<IVMini> {
	return {
		schema: typia.reflect.schema<IVMini>(),
		classify: typia.plain.createClassify<IVMini>(),
		assertClassify: typia.plain.createAssertClassify<IVMini>(),
		validateClassify: typia.plain.createValidateClassify<IVMini>(),
		clone: typia.plain.createClone<IVMini>(),
		assertClone: typia.plain.createAssertClone<IVMini>(),
		isClone: typia.plain.createIsClone<IVMini>(),
		validateClone: typia.plain.createValidateClone<IVMini>(),
		is: typia.createIs<IVMini>(),
		assert: typia.createAssert<IVMini>(),
		assertGuard: typia.createAssertGuard<IVMini>(),
		validate: typia.createValidate<IVMini>(),
		assertEquals: typia.createAssertEquals<IVMini>(),
		validateEquals: typia.createValidateEquals<IVMini>(),
		assertGuardEquals: typia.createAssertGuardEquals<IVMini>(),
		assertGuardValidate: typia.createAssertGuard<IVMini>(),
		stringify: typia.json.createStringify<IVMini>(),
		toJSON: typia.json.createAssertStringify<IVMini>(),
		isStringify: typia.json.createIsStringify<IVMini>(),
		validateStringify: typia.json.createValidateStringify<IVMini>(),
		fromJSON: typia.json.createAssertParse<IVMini>(),
		isParse: typia.json.createIsParse<IVMini>(),
		validateParse: typia.json.createValidateParse<IVMini>(),
		message: typia.protobuf.message<IVMini>(),
		encode: typia.protobuf.createAssertEncode<IVMini>(),
		decode: typia.protobuf.createAssertDecode<IVMini>(),
		isEncode: typia.protobuf.createIsEncode<IVMini>(),
		validateEncode: typia.protobuf.createValidateEncode<IVMini>(),
		isDecode: typia.protobuf.createIsDecode<IVMini>(),
		validateDecode: typia.protobuf.createValidateDecode<IVMini>(),
		equals: typia.compare.createEquals<IVMini>(),
		less: typia.compare.createLess<IVMini>(),
		more: (x: any, y: any) => typia.compare.createLess<IVMini>()(y, x),
		random: typia.createRandom<IVMini>(),
	};
}

function docModule(): SchemaModule<Doc> {
	return {
		schema: typia.reflect.schema<Doc>(),
		classify: typia.plain.createClassify<Doc>(),
		assertClassify: typia.plain.createAssertClassify<Doc>(),
		validateClassify: typia.plain.createValidateClassify<Doc>(),
		clone: typia.plain.createClone<Doc>(),
		assertClone: typia.plain.createAssertClone<Doc>(),
		isClone: typia.plain.createIsClone<Doc>(),
		validateClone: typia.plain.createValidateClone<Doc>(),
		is: typia.createIs<Doc>(),
		assert: typia.createAssert<Doc>(),
		assertGuard: typia.createAssertGuard<Doc>(),
		validate: typia.createValidate<Doc>(),
		assertEquals: typia.createAssertEquals<Doc>(),
		validateEquals: typia.createValidateEquals<Doc>(),
		assertGuardEquals: typia.createAssertGuardEquals<Doc>(),
		assertGuardValidate: typia.createAssertGuard<Doc>(),
		stringify: typia.json.createStringify<Doc>(),
		toJSON: typia.json.createAssertStringify<Doc>(),
		isStringify: typia.json.createIsStringify<Doc>(),
		validateStringify: typia.json.createValidateStringify<Doc>(),
		fromJSON: typia.json.createAssertParse<Doc>(),
		isParse: typia.json.createIsParse<Doc>(),
		validateParse: typia.json.createValidateParse<Doc>(),
		message: typia.protobuf.message<Doc>(),
		encode: typia.protobuf.createAssertEncode<Doc>(),
		decode: typia.protobuf.createAssertDecode<Doc>(),
		isEncode: typia.protobuf.createIsEncode<Doc>(),
		validateEncode: typia.protobuf.createValidateEncode<Doc>(),
		isDecode: typia.protobuf.createIsDecode<Doc>(),
		validateDecode: typia.protobuf.createValidateDecode<Doc>(),
		equals: typia.compare.createEquals<Doc>(),
		less: typia.compare.createLess<Doc>(),
		more: (x: any, y: any) => typia.compare.createLess<Doc>()(y, x),
		random: typia.createRandom<Doc>(),
	};
}

function makeMiniModel(capacities: any): any {
	return defineModel<IVMini>({
		schemaName: "IVMini",
		schemaModule: miniModule(),
		capacities,
	}) as any;
}

function makeDocModel(capacities: any): any {
	return defineModel<Doc>({
		schemaName: "Doc",
		schemaModule: docModule(),
		capacities,
	}) as any;
}

/**
 * Variant whose `classify` is an IDENTITY passthrough (preserves unknown props).
 * Used to prove the Immutable machinery itself carries every key it is handed —
 * the ONLY reason the default `docModule` drops unknown props is that its
 * `classify` (typia `plain.createClassify`) normalises to declared keys.
 */
function docModulePassthrough(): SchemaModule<Doc> {
	return { ...docModule(), classify: (x: unknown) => x as Doc };
}

function makeDocModelPassthrough(capacities: any): any {
	return defineModel<Doc>({
		schemaName: "Doc",
		schemaModule: docModulePassthrough(),
		capacities,
	}) as any;
}

const validMini = { name: "Ada", age: 36 };
const invalidMini = { name: "Ada", age: "no" as unknown as number };
const validDoc = { id: "u1", name: "Ada", age: 36 };

/** Invoke a frozen instance's property setter directly (assignment would be a
 *  silent no-op on the original, so we call the accessor and capture its
 *  return — the contractually-new object it must produce). */
function setProp(inst: any, key: string, value: unknown): any {
	const desc = Object.getOwnPropertyDescriptor(inst, key);
	if (!desc || typeof desc.set !== "function") {
		throw new Error(`no setter for "${key}"`);
	}
	return desc.set.call(inst, value);
}

// ---------------------------------------------------------------------------
// 1. Immutable + Validatable — they BOTH function on `update`, and an invalid
//    patch creates NO new object (the constructor throws before `Immutable`'s
//    `new Ctor(...)` can resolve and escape).
// ---------------------------------------------------------------------------
describe("Immutable + Validatable — valid update: both capacities function", () => {
	const M = makeMiniModel([
		{ capacity: Validatable, options: { onNew: "assert", onUpdate: "assert" } },
		Immutable,
	]);

	it("update returns a NEW frozen object carrying the validated data", () => {
		const inst = new M(validMini);
		const next = inst.update({ age: 40 });
		expect(next).not.toBe(inst); // Immutable ⇒ new object
		expect(Object.isFrozen(next)).toBe(true); // Immutable ⇒ frozen
		expect(next.age).toBe(40); // data applied
		expect(next.name).toBe("Ada"); // sibling preserved
		expect(inst.age).toBe(36); // original untouched
	});

	it("the new object is itself immutable (its setters yield newer objects)", () => {
		const inst = new M(validMini);
		const next = inst.update({ name: "Cy" });
		const newer = setProp(next, "name", "Dee");
		expect(newer).not.toBe(next);
		expect(newer.name).toBe("Dee");
		expect(next.name).toBe("Cy"); // `next` itself was not mutated
	});
});

describe("Immutable + Validatable — invalid update: NO new object is created", () => {
	// Config A: default classify (assertClassify) rejects invalid at classify time.
	const M = makeMiniModel([Validatable, Immutable]);

	it("wrong-typed patch throws and leaks no new object", () => {
		const inst = new M(validMini);
		let leaked: unknown = "UNSET";
		let thrown = false;
		try {
			leaked = inst.update({ age: "bad" });
		} catch {
			thrown = true;
		}
		expect(thrown).toBe(true);
		expect(leaked).toBe("UNSET"); // nothing returned / escaped
		expect(inst.age).toBe(36); // original unchanged
		expect(inst.name).toBe("Ada");
		expect(Object.isFrozen(inst)).toBe(true);
	});

	// Config B: isolate the onUpdate hook (plain classify, validation only here).
	const M2 = makeMiniModel([
		{
			capacity: Validatable,
			options: { classify: "classify", onUpdate: "assert" },
		},
		Immutable,
	]);

	it("onUpdate hook rejects the patch before reconstructing (no new object)", () => {
		const inst = new M2(validMini);
		let leaked: unknown = "UNSET";
		let thrown = false;
		try {
			leaked = inst.update({ age: "bad" });
		} catch {
			thrown = true;
		}
		expect(thrown).toBe(true);
		expect(leaked).toBe("UNSET");
		expect(inst.age).toBe(36);
	});

	it("invalid CONSTRUCTION also creates no object (constructor throws)", () => {
		const Ctor = makeMiniModel([Validatable, Immutable]);
		let leaked: unknown = "UNSET";
		let thrown = false;
		try {
			leaked = new Ctor(invalidMini);
		} catch {
			thrown = true;
		}
		expect(thrown).toBe(true);
		expect(leaked).toBe("UNSET");
	});
});

// ---------------------------------------------------------------------------
// 2. Immutable WITHOUT a validator — unvalidated: it can successfully write
//    "illegal" values (readonly id, wrong type, non-existent prop) and still
//    produce a new unvalidated frozen object every time.
// ---------------------------------------------------------------------------
describe("Immutable WITHOUT validator — unvalidated update succeeds on illegal props", () => {
	// Default `docModule`: plain `classify` (no Validatable ⇒ no validation
	// hooks). `classify` normalises to declared keys, so unknown props are
	// pruned — but the update still SUCCEEDS and yields a NEW immutable object.
	const M = makeDocModel([Immutable]);

	it("instance is frozen/immutable (Immutable still applies)", () => {
		const inst = new M(validDoc);
		expect(Object.isFrozen(inst)).toBe(true);
	});

	it("can update a readonly id to a different value (no readonly enforcement)", () => {
		const inst = new M(validDoc);
		const next = inst.update({ id: "u2" });
		expect(next).not.toBe(inst);
		expect(next.id).toBe("u2"); // readonly id successfully overridden
		expect(inst.id).toBe("u1"); // original untouched
		expect(Object.isFrozen(next)).toBe(true);
	});

	it("can set a field to the WRONG type (no type guard without validator)", () => {
		const inst = new M(validDoc);
		const next = inst.update({ age: "not-a-number" });
		expect(next.age).toBe("not-a-number"); // wrong type accepted, carried as-is
		expect(typeof next.age).toBe("string");
		expect(inst.age).toBe(36); // original untouched
		expect(Object.isFrozen(next)).toBe(true);
	});

	it("a NON-EXISTENT prop is pruned by classify but update still succeeds", () => {
		const inst = new M(validDoc);
		let thrown = false;
		let next: any;
		try {
			next = inst.update({ bonus: 999 });
		} catch {
			thrown = true;
		}
		expect(thrown).toBe(false); // unvalidated ⇒ no rejection
		expect(next).not.toBe(inst); // new object produced
		expect(Object.isFrozen(next)).toBe(true);
		// typia's `plain.createClassify` reconstructs from DECLARED keys, so the
		// unknown prop does NOT survive — this is normalisation, NOT validation.
		expect("bonus" in next).toBe(false);
		expect(inst.age).toBe(36);
	});

	it("serialises the schema-shaped result (unknown props already pruned)", () => {
		const inst = new M(validDoc);
		const next = inst.update({ id: "u2", age: "x", bonus: 999 });
		const json = JSON.parse(JSON.stringify(next));
		expect(json).toEqual({ id: "u2", name: "Ada", age: "x" });
	});
});

describe("Immutable WITHOUT validator + passthrough classify — unknown props ARE carried", () => {
	// With an identity `classify` (no normalisation), the Immutable machinery
	// carries EVERY key it is handed, including non-existent props — confirming
	// Immutability itself is permissive; only `classify` was pruning them.
	const M = makeDocModelPassthrough([Immutable]);
	const validDocP = { id: "u1", name: "Ada", age: 36 };

	it("carries a non-existent prop onto the new immutable object", () => {
		const inst = new M(validDocP);
		const next = inst.update({ bonus: 999 });
		expect(next.bonus).toBe(999); // unknown prop preserved
		expect("bonus" in next).toBe(true);
		expect(next).not.toBe(inst);
		expect(Object.isFrozen(next)).toBe(true);
		expect(inst.age).toBe(36);
	});

	it("serialises including the carried unknown prop", () => {
		const inst = new M(validDocP);
		const next = inst.update({ id: "u2", age: "x", bonus: 999 });
		const json = JSON.parse(JSON.stringify(next));
		expect(json).toEqual({ id: "u2", name: "Ada", age: "x", bonus: 999 });
	});
});
