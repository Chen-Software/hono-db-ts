import { describe, it, expect } from "bun:test";
import { defineModel } from "./base";
import typia from "typia";

interface Point {
	x: number;
	y: number;
}

describe("defineModel (shared base model)", () => {
	const PointModel = defineModel<Point>({
		schemaName: "Point",
		schema: typia.json.schema<[Point]>(),
		classify: (d) => typia.plain.assertClassify<Point>(d),
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
