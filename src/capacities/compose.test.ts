import { describe, it, expect } from "bun:test";
import typia from "typia";
import { composeCapabilities, registerCapacity } from "./compose";
import { Capable } from "./capable";
import { JsonSerialisable } from "./json-serialisable";
import { Immutable } from "./immutable";
import type { SchemaModule } from "./schema-module";

/** A synthetic capacity that registers itself the same guarded way every real
 *  capacity does — used to test composition ordering in isolation. */
function Tag<TBase extends Parameters<typeof Capable>[0]>(Base: TBase) {
	Base.prototype.capacities && Base.prototype.addCapacity("Tag");
	return Base;
}
registerCapacity("Tag", Tag as any);

interface Mini {
	name: string;
}

/** Fresh bare model each test (composition mutates the prototype it's given). */
function makeModel() {
	return class {
		data: Mini;
		constructor(data: Mini) {
			this.data = data;
		}
	};
}

/** Read the capacity registry off a composed class. */
function capsOf(cls: any): string[] {
	return [...cls.prototype.capacities] as string[];
}

/** The fixed schema module — bound once, handed to every capacity. */
function miniModule(): SchemaModule<Mini> {
	return {
		schema: typia.json.schema<[Mini]>(),
		classify: (d: any) => d,
		toJSON: typia.json.createAssertStringify<Mini>(),
		fromJSON: typia.json.createAssertParse<Mini>(),
		encode: typia.protobuf.createAssertEncode<Mini>(),
		decode: typia.protobuf.createAssertDecode<Mini>(),
		message: typia.protobuf.message<Mini>(),
	};
}

describe("composeCapabilities — array form", () => {
	it("auto-prepends Capable and registers declared capacities in order", () => {
		const composed = composeCapabilities(makeModel() as any, [
			JsonSerialisable,
			Tag,
		], miniModule());
		expect(capsOf(composed)).toEqual(["Capable", "JsonSerialisable", "Tag"]);
	});

	it("de-duplicates an explicit Capable (keeps it first, once)", () => {
		const composed = composeCapabilities(makeModel() as any, [
			Capable,
			JsonSerialisable,
		], miniModule());
		expect(capsOf(composed)).toEqual(["Capable", "JsonSerialisable"]);
	});

	it("applies Capable even when no capacity is declared", () => {
		const composed = composeCapabilities(makeModel() as any, undefined, miniModule());
		expect(capsOf(composed)).toEqual(["Capable"]);
	});

	it("threads the schema module into the capacity (JsonSerialisable round-trips)", () => {
		const composed = composeCapabilities(makeModel() as any, [
			JsonSerialisable,
		], miniModule());
		const json = (composed as any).toJSON({ name: "ada" });
		expect(typeof json).toBe("string");
		expect((composed as any).fromJSON(json)).toEqual({ name: "ada" });
	});

	it("produces a class a model can `extend` (the processed 'caps')", () => {
		const composed = composeCapabilities(makeModel() as any, [
			JsonSerialisable,
			Immutable,
		], miniModule());
		class MiniModel extends composed {
			static from(d: Mini) {
				return new MiniModel(d);
			}
		}
		const m = MiniModel.from({ name: "x" });
		expect((m as any).data.name).toBe("x");
		expect(Object.isFrozen(m)).toBe(true); // Immutable froze it
		expect(capsOf(MiniModel)).toEqual([
			"Capable",
			"JsonSerialisable",
			"Immutable",
		]);
	});
});

describe("composeCapabilities — object form", () => {
	it("resolves capacity names via the registry", () => {
		const composed = composeCapabilities(makeModel() as any, {
			JsonSerialisable: true,
			Tag: true,
		}, miniModule());
		expect(capsOf(composed)).toEqual(["Capable", "JsonSerialisable", "Tag"]);
	});

	it("is equivalent to the array form for the same declaration", () => {
		const arr = composeCapabilities(makeModel() as any, [
			JsonSerialisable,
		], miniModule());
		const obj = composeCapabilities(makeModel() as any, {
			JsonSerialisable: true,
		}, miniModule());
		expect(capsOf(arr)).toEqual(capsOf(obj));
	});

	it("throws on an unknown capacity name", () => {
		expect(() =>
			composeCapabilities(makeModel() as any, {
				DoesNotExist: true,
			}, miniModule()),
		).toThrow(/unknown capacity "DoesNotExist"/);
	});
});
