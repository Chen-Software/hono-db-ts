import { describe, expect, it } from "bun:test";
import { Stack } from "./stack";

describe("Stack Component", () => {
	it("should render basic Stack layout with defaults", () => {
		const html = (<Stack>Stack Content</Stack>).toString();
		expect(html).toContain("d_flex");
		expect(html).toContain("flex-d_row"); // defaults to horizontal (row)
		expect(html).toContain("gap_2"); // defaults to gap "2"
		expect(html).toContain("Stack Content");
	});

	it("should resolve direction values and custom direction aliases", () => {
		const verticalHtml = (<Stack direction="vertical">Item</Stack>).toString();
		expect(verticalHtml).toContain("flex-d_column");

		const horizontalHtml = (
			<Stack direction="horizontal">Item</Stack>
		).toString();
		expect(horizontalHtml).toContain("flex-d_row");

		const columnHtml = (<Stack direction="column">Item</Stack>).toString();
		expect(columnHtml).toContain("flex-d_column");

		const responsiveDirectionHtml = (
			<Stack direction={{ base: "column", md: "row" }}>Item</Stack>
		).toString();
		expect(responsiveDirectionHtml).toContain("flex-d_column");
		expect(responsiveDirectionHtml).toContain("md:flex-d_row");
	});

	it("should resolve align and justify aliases correctly", () => {
		const html = (
			<Stack align="center" justify="between">
				Item
			</Stack>
		).toString();
		expect(html).toContain("ai_center");
		expect(html).toContain("jc_space-between");
	});

	it("should handle static and responsive boolean wrap shortcut", () => {
		const wrappedHtml = (<Stack wrap>Item</Stack>).toString();
		expect(wrappedHtml).toContain("flex-wrap_wrap");

		const nowrapHtml = (<Stack wrap={false}>Item</Stack>).toString();
		expect(nowrapHtml).toContain("flex-wrap_nowrap");

		const responsiveWrapHtml = (
			<Stack wrap={{ base: false, md: true }}>Item</Stack>
		).toString();
		expect(responsiveWrapHtml).toContain("flex-wrap_nowrap");
		expect(responsiveWrapHtml).toContain("md:flex-wrap_wrap");
	});

	it("should support custom element rendering via 'as' prop", () => {
		const html = (<Stack as="ul">Item</Stack>).toString();
		expect(html).toContain("<ul");
		expect(html).toContain("</ul>");
		expect(html).toContain("d_flex");
	});

	it("should support 'asChild' for style delegation onto child elements", () => {
		const html = (
			<Stack asChild>
				<section id="custom-child">Child Item</section>
			</Stack>
		).toString();
		expect(html).toContain("<section");
		expect(html).toContain('id="custom-child"');
		expect(html).toContain("d_flex");
		expect(html).toContain("Child Item");
		expect(html).not.toContain("<div");
	});
});
