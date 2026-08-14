import { expect, test } from "bun:test";
import { Splitter } from "./splitter";

test("Splitter renders panels correctly", async () => {
	const panels = [
		{ id: "left", content: "Left Content" },
		{ id: "right", content: "Right Content" },
	];
	const html = (<Splitter panels={panels} />).toString();

	expect(html).toContain('data-part="root"');
	expect(html).toContain('data-part="panel"');
	expect(html).toContain('id="left"');
	expect(html).toContain("Left Content");
	expect(html).toContain('id="right"');
	expect(html).toContain("Right Content");
	// Should contain one resize trigger
	expect(html).toContain('data-part="resize-trigger"');
	expect(html).toContain('id="left:right"');
});

test("Splitter renders three panels with triggers", async () => {
	const panels = [
		{ id: "p1", content: "P1" },
		{ id: "p2", content: "P2" },
		{ id: "p3", content: "P3" },
	];
	const html = (<Splitter panels={panels} />).toString();

	expect(html).toContain('id="p1"');
	expect(html).toContain('id="p2"');
	expect(html).toContain('id="p3"');
	expect(html).toContain('id="p1:p2"');
	expect(html).toContain('id="p2:p3"');
});

test("Splitter orientation", async () => {
	const panels = [
		{ id: "1", content: "C1" },
		{ id: "2", content: "C2" },
	];
	const verticalHtml = (
		<Splitter panels={panels} orientation="vertical" />
	).toString();

	expect(verticalHtml).toContain('data-orientation="vertical"');
});
