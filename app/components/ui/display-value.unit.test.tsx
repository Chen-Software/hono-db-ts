import { describe, expect, it } from "bun:test";
import { DisplayValue } from "./display-value";

describe("DisplayValue component", () => {
	it("renders a string value as-is", () => {
		const html = (<DisplayValue value="Park UI" />).toString();
		expect(html).toBe("Park UI");
	});

	it("renders a numeric value coerced to a string", () => {
		const html = (<DisplayValue value={42} />).toString();
		expect(html).toBe("42");
	});

	it("applies formatValue to a non-empty value", () => {
		const date = new Date(2026, 0, 15);
		const html = (
			<DisplayValue
				value={date}
				formatValue={(d) => `${d.getFullYear()}-01-15`}
			/>
		).toString();
		expect(html).toBe("2026-01-15");
	});

	it("falls back to String(value) when formatValue returns null/undefined", () => {
		const html = (
			<DisplayValue value="raw" formatValue={() => undefined} />
		).toString();
		expect(html).toBe("raw");
	});

	it("renders the empty-state dash and hidden text for null", () => {
		const html = (<DisplayValue value={null} />).toString();
		expect(html).toContain("—");
		expect(html).toContain("No value available");
		expect(html).toContain('aria-hidden="true"');
	});

	it("renders the empty-state for undefined", () => {
		const html = (<DisplayValue value={undefined} />).toString();
		expect(html).toContain("No value available");
	});

	it("renders the empty-state for an empty string", () => {
		const html = (<DisplayValue value="" />).toString();
		expect(html).toContain("No value available");
	});

	it("renders the empty-state for an empty array", () => {
		const html = (<DisplayValue value={[]} />).toString();
		expect(html).toContain("No value available");
	});

	it("does not treat a non-empty array as empty", () => {
		const html = (
			<DisplayValue value={["a", "b"]} formatValue={(v) => v.join(", ")} />
		).toString();
		expect(html).toBe("a, b");
	});

	it("does not treat 0 or false as empty", () => {
		expect((<DisplayValue value={0} />).toString()).toBe("0");
		expect((<DisplayValue value={false} />).toString()).toBe("false");
	});
});
