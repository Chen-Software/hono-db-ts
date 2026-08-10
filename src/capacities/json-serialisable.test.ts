import { describe, expect, it } from "bun:test";
import typia from "typia";
import { Capable, type CapacityConstructor } from "./capable";
import {
	JsonSerialisable,
	type JsonSerialisableSchema,
} from "./json-serialisable";

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
			return Object.assign(this, data);
		}
	};

// The synthetic "Guarded" idiom: a capacity that registers only when `Capable`
// has paved the registry — used to prove the new capacity obeys that control.
function Guarded<TBase extends CapacityConstructor>(Base: TBase) {
	Base.prototype.capacities && Base.prototype.addCapacity("Guarded");
	return class extends Base {};
}

const serialiser = {
	toJSON: typia.json.createAssertStringify<Foo>(),
	fromJSON: typia.json.createAssertParse<Foo>(),
};

describe("JsonSerialisable registers itself (via Capable gatekeeper)", () => {
	it("adds 'JsonSerialisable' to the registry once Capable is present", () => {
		const C = JsonSerialisable(Capable(makeFooModel()), serialiser);
		const caps = (C as unknown as { prototype: { capacities: Set<string> } })
			.prototype.capacities;
		expect(caps.has("Capable")).toBe(true);
		expect(caps.has("JsonSerialisable")).toBe(true);
	});

	it("without Capable, the capacity refuses to register (guarded)", () => {
		const C = Guarded(JsonSerialisable(makeFooModel(), serialiser));
		const caps = (C as unknown as { prototype: { capacities?: Set<string> } })
			.prototype.capacities;
		expect(caps).toBeUndefined();
	});
});

describe("JsonSerialisable adds toJSON / fromJSON", () => {
	const C = JsonSerialisable(Capable(makeFooModel()), serialiser);

	it("exposes both as static functions", () => {
		expect(typeof (C as unknown as { toJSON: unknown }).toJSON).toBe("function");
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

	it("fromJSON throws on malformed JSON", () => {
		expect(() =>
			(C as unknown as { fromJSON: (j: string) => Foo }).fromJSON("{bad}"),
		).toThrow();
	});

	it("fromJSON throws when fields violate the schema", () => {
		expect(() =>
			(C as unknown as { fromJSON: (j: string) => Foo }).fromJSON(
				JSON.stringify({ name: 123, n: "no" }),
			),
		).toThrow();
	});
});

describe("JsonSerialisable instance toJSON + JSON-override constructor", () => {
	const C = JsonSerialisable(Capable(makeFooModel()), serialiser);

	it("instance toJSON() returns the instance so JSON.stringify yields the object", () => {
		const inst = new C({ name: "y", n: 2 }) as unknown as {
			toJSON(): unknown;
		};
		expect(inst.toJSON()).toBe(inst);
		expect(JSON.stringify(inst)).toBe('{"name":"y","n":2}');
	});

	it("JSON-override constructor: new X(jsonString) parses then constructs", () => {
		const json = '{"name":"z","n":3}';
		const inst = new C(json) as unknown as Foo & { constructor: unknown };
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
