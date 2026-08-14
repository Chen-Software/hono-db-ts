import { describe, expect, test } from "bun:test";
import { HoverCard } from "./hover-card";

describe("HoverCard Unit Tests", () => {
	test("should render correctly", () => {
		const html = (
			<HoverCard
				interactive={false}
				trigger={<span>Hover me</span>}
				title="HoverCard Title"
				description="This is the description."
			/>
		).toString();

		expect(html).toContain('data-part="trigger"');
		expect(html).toContain("Hover me");
		expect(html).toContain('data-part="positioner"');
		expect(html).toContain('role="dialog"');
		expect(html).toContain("HoverCard Title");
		expect(html).toContain("This is the description.");
	});

	test("should always render an arrow", () => {
		const html = (<HoverCard interactive={false} />).toString();

		expect(html).toContain('data-part="arrow"');
	});

	test("should default to bottom placement", () => {
		const html = (<HoverCard interactive={false} />).toString();

		expect(html).toContain('data-placement="bottom"');
	});

	test("should support top/left/right placement", () => {
		for (const placement of ["top", "left", "right"] as const) {
			const html = (
				<HoverCard interactive={false} placement={placement} />
			).toString();

			expect(html).toContain(`data-placement="${placement}"`);
		}
	});

	test("should render custom content when provided", () => {
		const html = (
			<HoverCard interactive={false} content={<div>Custom Content</div>} />
		).toString();

		expect(html).toContain("Custom Content");
		expect(html).not.toContain("HoverCard Title");
	});

	test("should make a non-native trigger keyboard-focusable", () => {
		const html = (
			<HoverCard interactive={false} trigger={<span>Hover me</span>} />
		).toString();

		expect(html).toContain('tabIndex="0"');
		expect(html).toContain('role="button"');
	});

	test("should not override a native button/anchor trigger's semantics", () => {
		const buttonHtml = (
			<HoverCard
				interactive={false}
				trigger={
					<button type="button" class="my-btn">
						Hover me
					</button>
				}
			/>
		).toString();
		expect(buttonHtml).not.toContain('role="button"');

		const anchorHtml = (
			<HoverCard interactive={false} trigger={<a href="/profile">Jules</a>} />
		).toString();
		expect(anchorHtml).not.toContain('role="button"');
		expect(anchorHtml).toContain('href="/profile"');
	});

	test("should default the plain (non-asChild) trigger to focusable", () => {
		const html = (
			<HoverCard.Root>
				<HoverCard.Trigger>
					<span>Hover me</span>
				</HoverCard.Trigger>
			</HoverCard.Root>
		).toString();

		expect(html).toContain('tabIndex="0"');
		expect(html).toContain('role="button"');
	});

	test("should reflect disabled via aria-disabled on the trigger", () => {
		const html = (
			<HoverCard.Root disabled>
				<HoverCard.Trigger>
					<span>Hover me</span>
				</HoverCard.Trigger>
			</HoverCard.Root>
		).toString();

		expect(html).toContain('aria-disabled="true"');
	});

	test("should render compound/composable API correctly", () => {
		const html = (
			<HoverCard.Root>
				<HoverCard.Trigger>
					<span>Hover me</span>
				</HoverCard.Trigger>
				<HoverCard.Positioner>
					<HoverCard.Content>
						Supplementary information shown on hover.
					</HoverCard.Content>
				</HoverCard.Positioner>
			</HoverCard.Root>
		).toString();

		expect(html).toContain('data-part="trigger"');
		expect(html).toContain("Hover me");
		expect(html).toContain('data-part="positioner"');
		expect(html).toContain('role="dialog"');
		expect(html).toContain("Supplementary information shown on hover.");
	});
});
