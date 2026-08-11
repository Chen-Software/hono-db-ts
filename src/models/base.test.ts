import { describe, expect, it } from "bun:test";
import typia from "typia";
import { defineModel } from "./base";

interface Point {
	x: number;
	y: number;
}

// The fixed bundle of typia bindings, bound concretely at the model site.
const PointSchemaModule = {
	schema: typia.json.schema<[Point]>(),
	classify: typia.plain.createAssertClassify<Point>(),
	assertClassify: typia.plain.createAssertClassify<Point>(),
	validateClassify: typia.plain.createValidateClassify<Point>(),
	clone: typia.plain.createClone<Point>(),
	assertClone: typia.plain.createAssertClone<Point>(),
	isClone: typia.plain.createIsClone<Point>(),
	validateClone: typia.plain.createValidateClone<Point>(),
	is: typia.createIs<Point>(),
	assert: typia.createAssert<Point>(),
	assertGuard: typia.createAssertGuard<Point>(),
	validate: typia.createValidate<Point>(),
	"assert-equals": typia.createAssertEquals<Point>(),
	"validate-equals": typia.createValidateEquals<Point>(),
	"assert-guard-equals": typia.createAssertGuardEquals<Point>(),
	"assert-guard-validate": typia.createAssertGuard<Point>(),
	stringify: typia.json.createStringify<Point>(),
	toJSON: typia.json.createAssertStringify<Point>(),
	isStringify: typia.json.createIsStringify<Point>(),
	validateStringify: typia.json.createValidateStringify<Point>(),
	fromJSON: typia.json.createAssertParse<Point>(),
	isParse: typia.json.createIsParse<Point>(),
	validateParse: typia.json.createValidateParse<Point>(),
	message: typia.protobuf.message<Point>(),
	encode: typia.protobuf.createAssertEncode<Point>(),
	decode: typia.protobuf.createAssertDecode<Point>(),
	isEncode: typia.protobuf.createIsEncode<Point>(),
	validateEncode: typia.protobuf.createValidateEncode<Point>(),
	isDecode: typia.protobuf.createIsDecode<Point>(),
	validateDecode: typia.protobuf.createValidateDecode<Point>(),
	equals: typia.compare.createEquals<Point>(),
	less: typia.compare.createLess<Point>(),
	more: (x: any, y: any) => typia.compare.createLess<Point>()(y, x),
	random: typia.createRandom<Point>(),
};

describe("defineModel (shared base model)", () => {
	const PointModel = defineModel<Point>({
		schemaName: "Point",
		schemaModule: PointSchemaModule,
	});

	it("exposes the schema type name as a runtime string", () => {
		expect((PointModel as any).schemaName).toBe("Point");
	});

	it("exposes the typia schema object at runtime", () => {
		expect(typeof (PointModel as any).schema).toBe("object");
	});

	it("classifies + assigns fields through the constructor", () => {
		const p = new (PointModel as any)({ x: 1, y: 2 });
		expect(p.x).toBe(1);
		expect(p.y).toBe(2);
	});

	it("throws on invalid input (assertClassify)", () => {
		expect(() => new (PointModel as any)({ x: "no", y: 2 })).toThrow();
	});

	it("schemaName is inherited by subclasses (mirrors User/Post)", () => {
		class Pt extends PointModel {}
		expect((Pt as any).schemaName).toBe("Point");
		expect((Pt as any).schema).toBeDefined();
	});
});
