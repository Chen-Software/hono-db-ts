import { describe, expect, it } from "bun:test";
import typia from "typia";
import { Triggerable } from "./triggerable";
import { composeCapabilities, registerCapacity } from "./compose";
import { Immutable } from "./immutable";
import { JsonSerialisable } from "./json-serialisable";
import type { SchemaModule } from "./schema-module";

/** A synthetic capacity that registers itself the same guarded way every real
 *  capacity does — used to test composition ordering in isolation. */
function Tag<TBase extends Parameters<typeof Triggerable>[0]>(Base: TBase) {
	Base.prototype.capacities && Base.prototype.addCapacity("Tag");
	return Base;
}
registerCapacity("Tag", Tag as any);

interface ComposePayload {
	name: string;
}

/** Fresh bare model each test (composition mutates the prototype it's given). */
function makeModel() {
	return class {
		data: ComposePayload;
		constructor(data: ComposePayload) {
			this.data = data;
		}
	};
}

/** Read the capacity registry off a composed class. */
function capsOf(cls: any): string[] {
	return [...cls.prototype.capacities] as string[];
}

/** The fixed schema module — bound once, handed to every capacity. */
function miniModule(): SchemaModule<ComposePayload> {
	return {
		schema: typia.json.schema<[ComposePayload]>(),
		classify: typia.plain.createClassify<ComposePayload>(),
		assertClassify: typia.plain.createAssertClassify<ComposePayload>(),
		validateClassify: typia.plain.createValidateClassify<ComposePayload>(),
		clone: typia.plain.createClone<ComposePayload>(),
		assertClone: typia.plain.createAssertClone<ComposePayload>(),
		isClone: typia.plain.createIsClone<ComposePayload>(),
		validateClone: typia.plain.createValidateClone<ComposePayload>(),
		is: typia.createIs<ComposePayload>(),
		assert: typia.createAssert<ComposePayload>(),
		assertGuard: typia.createAssertGuard<ComposePayload>(),
		validate: typia.createValidate<ComposePayload>(),
		assertEquals: typia.createAssertEquals<ComposePayload>(),
		validateEquals: typia.createValidateEquals<ComposePayload>(),
		assertGuardEquals: typia.createAssertGuardEquals<ComposePayload>(),
		assertGuardValidate: typia.createAssertGuard<ComposePayload>(),
		stringify: typia.json.createStringify<ComposePayload>(),
		toJSON: typia.json.createAssertStringify<ComposePayload>(),
		isStringify: typia.json.createIsStringify<ComposePayload>(),
		validateStringify: typia.json.createValidateStringify<ComposePayload>(),
		fromJSON: typia.json.createAssertParse<ComposePayload>(),
		isParse: typia.json.createIsParse<ComposePayload>(),
		validateParse: typia.json.createValidateParse<ComposePayload>(),
		message: typia.protobuf.message<ComposePayload>(),
		encode: typia.protobuf.createAssertEncode<ComposePayload>(),
		decode: typia.protobuf.createAssertDecode<ComposePayload>(),
		isEncode: typia.protobuf.createIsEncode<ComposePayload>(),
		validateEncode: typia.protobuf.createValidateEncode<ComposePayload>(),
		isDecode: typia.protobuf.createIsDecode<ComposePayload>(),
		validateDecode: typia.protobuf.createValidateDecode<ComposePayload>(),
		equals: typia.compare.createEquals<ComposePayload>(),
		less: typia.compare.createLess<ComposePayload>(),
		more: (x: any, y: any) => typia.compare.createLess<ComposePayload>()(y, x),
		random: typia.createRandom<ComposePayload>(),
	};
}

describe("composeCapabilities — array form", () => {
	it("auto-prepends Triggerable and registers declared capacities in order", () => {
		const composed = composeCapabilities(
			makeModel() as any,
			[JsonSerialisable, Tag],
			miniModule(),
		);
		expect(capsOf(composed)).toEqual([
			"Triggerable",
			"JsonSerialisable",
			"Tag",
		]);
	});

	it("de-duplicates an explicit Triggerable (keeps it first, once)", () => {
		const composed = composeCapabilities(
			makeModel() as any,
			[Triggerable, JsonSerialisable],
			miniModule(),
		);
		expect(capsOf(composed)).toEqual(["Triggerable", "JsonSerialisable"]);
	});

	it("applies Triggerable even when no capacity is declared", () => {
		const composed = composeCapabilities(
			makeModel() as any,
			undefined,
			miniModule(),
		);
		expect(capsOf(composed)).toEqual(["Triggerable"]);
	});

	it("threads the schema module into the capacity (JsonSerialisable round-trips)", () => {
		const composed = composeCapabilities(
			makeModel() as any,
			[JsonSerialisable],
			miniModule(),
		);
		const json = (composed as any).toJSON({ name: "ada" });
		expect(typeof json).toBe("string");
		expect((composed as any).fromJSON(json)).toEqual({ name: "ada" });
	});

	it("produces a class a model can `extend` (the processed 'caps')", () => {
		const composed = composeCapabilities(
			makeModel() as any,
			[JsonSerialisable, Immutable],
			miniModule(),
		);
		class ComposeModel extends composed {
			static from(d: ComposePayload) {
				return new ComposeModel(d);
			}
		}
		const m = ComposeModel.from({ name: "x" });
		expect((m as any).data.name).toBe("x");
		expect(Object.isFrozen(m)).toBe(true); // Immutable froze it
		expect(capsOf(ComposeModel)).toEqual([
			"Triggerable",
			"JsonSerialisable",
			"Immutable",
		]);
	});
});

describe("composeCapabilities — object form", () => {
	it("resolves capacity names via the registry", () => {
		const composed = composeCapabilities(
			makeModel() as any,
			{
				JsonSerialisable: true,
				Tag: true,
			},
			miniModule(),
		);
		expect(capsOf(composed)).toEqual([
			"Triggerable",
			"JsonSerialisable",
			"Tag",
		]);
	});

	it("is equivalent to the array form for the same declaration", () => {
		const arr = composeCapabilities(
			makeModel() as any,
			[JsonSerialisable],
			miniModule(),
		);
		const obj = composeCapabilities(
			makeModel() as any,
			{
				JsonSerialisable: true,
			},
			miniModule(),
		);
		expect(capsOf(arr)).toEqual(capsOf(obj));
	});

	it("throws on an unknown capacity name", () => {
		expect(() =>
			composeCapabilities(
				makeModel() as any,
				{
					DoesNotExist: true,
				},
				miniModule(),
			),
		).toThrow(/unknown capacity "DoesNotExist"/);
	});
});
