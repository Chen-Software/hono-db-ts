import { describe, expect, it } from "bun:test";
import { Grid } from "./grid";

describe("Grid Component", () => {
	it("should render basic Grid layout", () => {
		const html = (<Grid>Grid Content</Grid>).toString();
		expect(html).toContain("d_grid");
		expect(html).toContain("Grid Content");
	});

	it("should apply columns, rows, gap, and minChildWidth", () => {
		const html = (
			<Grid columns={4} rows={3} gap="6" minChildWidth="150px">
				Item
			</Grid>
		).toString();

		expect(html).toContain("grid-tc_repeat(4,_minmax(0,_1fr))");
		expect(html).toContain("grid-tr_repeat(3,_minmax(0,_1fr))");
		expect(html).toContain("gap_6");
	});

	it("should parse responsive columns and rows properties", () => {
		const html = (
			<Grid columns={{ base: 1, md: 3 }} rows={{ base: 2, lg: 4 }}>
				Item
			</Grid>
		).toString();

		expect(html).toContain("grid-tc_repeat(1,_minmax(0,_1fr))");
		expect(html).toContain("md:grid-tc_repeat(3,_minmax(0,_1fr))");
		expect(html).toContain("grid-tr_repeat(2,_minmax(0,_1fr))");
		expect(html).toContain("lg:grid-tr_repeat(4,_minmax(0,_1fr))");
	});

	it("should apply custom (non-numeric) grid-template-rows and columns strings as-is", () => {
		const html = (
			<Grid columns="auto 1fr auto" rows="min-content 1fr">
				Item
			</Grid>
		).toString();

		expect(html).toContain("grid-tc_auto_1fr_auto");
		expect(html).toContain("grid-tr_min-content_1fr");
	});

	it("should support responsive custom non-numeric grid template values", () => {
		const html = (
			<Grid
				columns={{ base: "1fr", md: "200px 1fr" }}
				rows={{ base: "auto", lg: "minmax(100px,_auto)_1fr" }}
			>
				Item
			</Grid>
		).toString();

		expect(html).toContain("grid-tc_1fr");
		expect(html).toContain("md:grid-tc_200px_1fr");
		expect(html).toContain("grid-tr_auto");
		expect(html).toContain("lg:grid-tr_minmax(100px,_auto)_1fr");
	});

	it("should support rendering as a custom HTML tag via 'as' prop", () => {
		const html = (<Grid as="section">Item</Grid>).toString();
		expect(html).toContain("<section");
		expect(html).toContain("</section>");
		expect(html).toContain("d_grid");
	});

	it("should support 'asChild' for style delegation onto child elements", () => {
		const html = (
			<Grid asChild>
				<ul id="grid-list">
					<li>First</li>
					<li>Second</li>
				</ul>
			</Grid>
		).toString();

		expect(html).toContain("<ul");
		expect(html).toContain('id="grid-list"');
		expect(html).toContain("d_grid");
		expect(html).toContain("First");
		expect(html).not.toContain("<div");
	});
});
