import { expect, test } from "bun:test";
import { Icon } from "./icon";

function render(node: unknown) {
	return (node as unknown as { toString: () => string }).toString();
}

test("Icon wraps bare path children in a generated svg with default size", async () => {
	const html = render(await Icon({ children: <path d="M0 0h24v24H0z" /> }));
	expect(html).toContain("<svg");
	expect(html).toContain('class="icon icon--size_md"');
	expect(html).toContain('aria-hidden="true"');
	expect(html).toContain("M0 0h24v24H0z");
});

test("Icon applies the size variant class", async () => {
	const html = render(
		await Icon({ size: "lg", children: <path d="M0 0h24v24H0z" /> }),
	);
	expect(html).toContain('class="icon icon--size_lg"');
});

test("Icon merges its class onto a single svg child instead of double-wrapping (asChild default)", async () => {
	const html = render(
		await Icon({
			children: (
				<svg class="my-icon" viewBox="0 0 24 24">
					<path d="M0 0h24v24H0z" />
				</svg>
			),
		}),
	);
	const svgOpenTags = html.match(/<svg/g) ?? [];
	expect(svgOpenTags).toHaveLength(1);
	expect(html).toContain('class="icon icon--size_md my-icon"');
	expect(html).toContain('viewBox="0 0 24 24"');
});

test("Icon wraps instead of merging when asChild is false", async () => {
	const html = render(
		await Icon({
			asChild: false,
			children: <svg class="my-icon" viewBox="0 0 24 24" />,
		}),
	);
	const svgOpenTags = html.match(/<svg/g) ?? [];
	expect(svgOpenTags).toHaveLength(2);
});

test("Icon wraps instead of merging when there are multiple children", async () => {
	const html = render(
		await Icon({
			children: [<path key="a" d="M0 0" />, <path key="b" d="M1 1" />],
		}),
	);
	const svgOpenTags = html.match(/<svg/g) ?? [];
	expect(svgOpenTags).toHaveLength(1);
	expect(html).toContain("M0 0");
	expect(html).toContain("M1 1");
});

test("Icon omits aria-hidden and renders aria-label when one is provided", async () => {
	const html = render(
		await Icon({
			"aria-label": "Search",
			children: <path d="M0 0h24v24H0z" />,
		}),
	);
	expect(html).not.toContain("aria-hidden");
	expect(html).toContain('aria-label="Search"');
});
