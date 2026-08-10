import { describe, expect, it } from "bun:test";
import typia from "typia";
import { Capable, type CapacityConstructor } from "./capable";
import {
	JsonSerialisable,
	type JsonSerialisableSchema,
} from "./json-serialisable";
import type { SchemaModule } from "./schema-module";

/**
 * Minimal schema + base model, isolated per test (the capacity mutates the
 * prototype it is handed, so a fresh base each time keeps registrations clean).
 */
interface Foo {
	name: string;
	n: number;
}

const makeFooModel = () =>
	class FooModel {
		constructor(data: Foo) {
			Object.assign(this, data);
		}
	};

// The synthetic "Guarded" idiom: a capacity that registers only when `Capable`
// has paved the registry — used to prove the new capacity obeys that control.
function Guarded<TBase extends CapacityConstructor>(Base: TBase) {
	Base.prototype.capacities && Base.prototype.addCapacity("Guarded");
	return class extends Base {};
}

// The fixed schema module — bound once, handed to the capacity.
const fooModule: SchemaModule<Foo> = {
	schema: typia.json.schema<[Foo]>(),
	classify: (d: any) => d,
	assertClassify: (d: any) => d,
	validateClassify: (d: any) => ({ success: true, data: d }),
	clone: typia.plain.createClone<Foo>(),
	assertClone: typia.plain.createAssertClone<Foo>(),
	isClone: typia.plain.createIsClone<Foo>(),
	validateClone: typia.plain.createValidateClone<Foo>(),
	is: typia.createIs<Foo>(),
	assert: typia.createAssert<Foo>(),
	assertGuard: typia.createAssertGuard<Foo>(),
	validate: typia.createValidate<Foo>(),
	"assert-equals": typia.createAssertEquals<Foo>(),
	"validate-equals": typia.createValidateEquals<Foo>(),
	"assert-guard-equals": typia.createAssertGuardEquals<Foo>(),
	"assert-guard-validate": typia.createAssertGuard<Foo>(),
	stringify: typia.json.createStringify<Foo>(),
	toJSON: typia.json.createAssertStringify<Foo>(),
	isStringify: typia.json.createIsStringify<Foo>(),
	validateStringify: typia.json.createValidateStringify<Foo>(),
	fromJSON: typia.json.createAssertParse<Foo>(),
	isParse: typia.json.createIsParse<Foo>(),
	validateParse: typia.json.createValidateParse<Foo>(),
	message: typia.protobuf.message<Foo>(),
	encode: typia.protobuf.createAssertEncode<Foo>(),
	decode: typia.protobuf.createAssertDecode<Foo>(),
	isEncode: typia.protobuf.createIsEncode<Foo>(),
	validateEncode: typia.protobuf.createValidateEncode<Foo>(),
	isDecode: typia.protobuf.createIsDecode<Foo>(),
	validateDecode: typia.protobuf.createValidateDecode<Foo>(),
	equals: typia.compare.createEquals<Foo>(),
	less: typia.compare.createLess<Foo>(),
	more: (x: any, y: any) => typia.compare.createLess<Foo>()(y, x),
	random: typia.createRandom<Foo>(),
};

describe("JsonSerialisable registers itself (via Capable gatekeeper)", () => {
	it("adds 'JsonSerialisable' to the registry once Capable is present", () => {
		const C = JsonSerialisable(Capable(makeFooModel()), fooModule);
		const caps = (C as unknown as { prototype: { capacities: Set<string> } })
			.prototype.capacities;
		expect(caps.has("Capable")).toBe(true);
		expect(caps.has("JsonSerialisable")).toBe(true);
	});

	it("without Capable, the capacity refuses to register (guarded)", () => {
		const C = Guarded(JsonSerialisable(makeFooModel(), fooModule));
		const caps = (C as unknown as { prototype: { capacities?: Set<string> } })
			.prototype.capacities;
		expect(caps).toBeUndefined();
	});
});

describe("JsonSerialisable adds toJSON / fromJSON", () => {
	const C = JsonSerialisable(Capable(makeFooModel()), fooModule);

	it("exposes both as static functions", () => {
		expect(typeof (C as unknown as { toJSON: unknown }).toJSON).toBe(
			"function",
		);
		expect(typeof (C as unknown as { fromJSON: unknown }).fromJSON).toBe(
			"function",
		);
	});

	it("toJSON → fromJSON round-trips validated data", () => {
		const json = (C as unknown as { toJSON: (d: Foo) => string }).toJSON({
			name: "x",
			n: 1,
		});
		expect(json).toBeTypeOf("string");
		const back = (C as unknown as { fromJSON: (j: string) => Foo }).fromJSON(
			json,
		);
		expect(back).toEqual({ name: "x", n: 1 });
	});

	it("fromJSON throws on malformed JSON (parse error, regardless of validator)", () => {
		expect(() =>
			(C as unknown as { fromJSON: (j: string) => Foo }).fromJSON("{bad}"),
		).toThrow();
	});

	it("fromJSON is LENIENT without Validatable: does NOT validate, permits illegal fields", () => {
		// No `Validatable` in this composition ⇒ the JSON-override parse falls
		// back to a bare `JSON.parse`, so schema violations pass through.
		const back = (C as unknown as { fromJSON: (j: string) => Foo }).fromJSON(
			JSON.stringify({ name: 123, n: "no" }),
		);
		expect(back).toEqual({ name: 123, n: "no" });
	});
});

describe("JsonSerialisable fromJSON validates WHEN Validatable is present", () => {
	// Simulate `Validatable` being declared in the model so the capacity's
	// `ctx.has("Validatable")` is true and the strict parse is selected.
	const C = JsonSerialisable(
		Capable(makeFooModel()),
		fooModule,
		{},
		{
			has: (name) => name === "Validatable",
		},
	);

	it("fromJSON throws when fields violate the schema", () => {
		expect(() =>
			(C as unknown as { fromJSON: (j: string) => Foo }).fromJSON(
				JSON.stringify({ name: 123, n: "no" }),
			),
		).toThrow();
	});

	it("fromJSON still throws on malformed JSON", () => {
		expect(() =>
			(C as unknown as { fromJSON: (j: string) => Foo }).fromJSON("{bad}"),
		).toThrow();
	});

	it("fromJSON validates the JSON-override constructor too", () => {
		expect(
			() =>
				new (C as unknown as new (d: any) => Foo)(
					JSON.stringify({ name: 123 }) as any,
				),
		).toThrow();
	});
});

describe("JsonSerialisable instance toJSON + JSON-override constructor", () => {
	const C = JsonSerialisable(Capable(makeFooModel()), fooModule);

	it("instance toJSON() returns the instance so JSON.stringify yields the object", () => {
		const inst = new C({ name: "y", n: 2 }) as unknown as {
			toJSON(): unknown;
		};
		expect(inst.toJSON()).toBe(inst);
		expect(JSON.stringify(inst)).toBe('{"name":"y","n":2}');
	});

	it("JSON-override constructor: new X(jsonString) parses then constructs", () => {
		const json = '{"name":"z","n":3}';
		const inst = new C(json as any) as unknown as Foo & {
			constructor: unknown;
		};
		expect(inst.name).toBe("z");
		expect(inst.n).toBe(3);
		expect(inst instanceof C).toBe(true);
	});

	it("plain-object construction still works (no override)", () => {
		const inst = new C({ name: "w", n: 4 }) as unknown as Foo;
		expect(inst.name).toBe("w");
		expect(inst.n).toBe(4);
	});
});

describe("JsonSerialisableSchema is a pure marker", () => {
	it("is the empty object type (no runtime surface)", () => {
		const m: JsonSerialisableSchema = {};
		expect(m).toEqual({});
	});
});
