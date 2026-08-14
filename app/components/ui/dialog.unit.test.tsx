import { describe, expect, test } from "bun:test";
import { Dialog } from "./dialog";
import { hasOpenNested } from "./overlay-a11y";

describe("Dialog Unit Tests", () => {
	test("should render flattened API correctly", () => {
		const html = (
			<Dialog
				trigger={<button type="button">Open</button>}
				title="Dialog Title"
				description="Dialog Description"
				body="Body content"
				cancel={<button type="button">Close</button>}
			/>
		).toString();

		expect(html).toContain('data-part="trigger"');
		expect(html).toContain("Open");
		expect(html).toContain('data-part="content"');
		expect(html).toContain("Dialog Title");
		expect(html).toContain("Dialog Description");
		expect(html).toContain("Body content");
		expect(html).toContain("Close");
		expect(html).toContain('data-part="close-trigger"');
	});

	test("should expose compound namespace on main export", () => {
		expect(Dialog.Root).toBeDefined();
		expect(Dialog.Trigger).toBeDefined();
		expect(Dialog.Backdrop).toBeDefined();
		expect(Dialog.Positioner).toBeDefined();
		expect(Dialog.Content).toBeDefined();
		expect(Dialog.Header).toBeDefined();
		expect(Dialog.Body).toBeDefined();
		expect(Dialog.Footer).toBeDefined();
		expect(Dialog.Title).toBeDefined();
		expect(Dialog.Description).toBeDefined();
		expect(Dialog.CloseTrigger).toBeDefined();
		expect(Dialog.ActionTrigger).toBeDefined();
	});

	test("should render compound components correctly", () => {
		const html = (
			<Dialog.Root open={true}>
				<Dialog.Trigger>Open Trigger</Dialog.Trigger>
				<Dialog.Backdrop />
				<Dialog.Positioner>
					<Dialog.Content>
						<Dialog.Header>
							<Dialog.Title>My Title</Dialog.Title>
							<Dialog.Description>My Description</Dialog.Description>
						</Dialog.Header>
						<Dialog.Body>My Body</Dialog.Body>
						<Dialog.Footer>
							<Dialog.CloseTrigger>Close Me</Dialog.CloseTrigger>
							<Dialog.ActionTrigger>Action Me</Dialog.ActionTrigger>
						</Dialog.Footer>
					</Dialog.Content>
				</Dialog.Positioner>
			</Dialog.Root>
		).toString();

		expect(html).toContain('data-part="trigger"');
		expect(html).toContain("Open Trigger");
		expect(html).toContain('data-part="backdrop"');
		expect(html).toContain('data-part="positioner"');
		expect(html).toContain('data-part="content"');
		expect(html).toContain('data-part="title"');
		expect(html).toContain("My Title");
		expect(html).toContain('data-part="description"');
		expect(html).toContain("My Description");
		expect(html).toContain("My Body");
		expect(html).toContain('data-part="close-trigger"');
		expect(html).toContain("Close Me");
		expect(html).toContain('data-part="action-trigger"');
		expect(html).toContain("Action Me");
	});

	test("should render data-overlay-root on Dialog and nested Select components", () => {
		const html = (
			<Dialog.Root open={true}>
				<Dialog.Trigger>Open Dialog</Dialog.Trigger>
				<Dialog.Content>
					<div
						id="nested-select"
						data-scope="select"
						data-part="root"
						data-overlay-root
					>
						<button data-part="trigger">Open Select</button>
					</div>
				</Dialog.Content>
			</Dialog.Root>
		).toString();

		expect(html).toContain('data-overlay-root="true"');
		expect(html).toContain('data-scope="select"');
	});

	test('should render data-scope="dialog" and trigger data-state on every part', () => {
		const closedHtml = (
			<Dialog.Root open={false}>
				<Dialog.Trigger>Open</Dialog.Trigger>
				<Dialog.Backdrop />
				<Dialog.Positioner>
					<Dialog.Content>
						<Dialog.CloseTrigger>Close</Dialog.CloseTrigger>
						<Dialog.ActionTrigger>Go</Dialog.ActionTrigger>
					</Dialog.Content>
				</Dialog.Positioner>
			</Dialog.Root>
		).toString();

		for (const part of [
			"trigger",
			"backdrop",
			"positioner",
			"content",
			"close-trigger",
			"action-trigger",
		]) {
			expect(closedHtml).toContain(`data-scope="dialog" data-part="${part}"`);
		}
		expect(closedHtml).toContain('data-part="trigger" data-state="closed"');

		const openHtml = (
			<Dialog.Root open={true}>
				<Dialog.Trigger>Open</Dialog.Trigger>
			</Dialog.Root>
		).toString();
		expect(openHtml).toContain('data-part="trigger" data-state="open"');
	});

	test("should identify open nested overlays with hasOpenNested", () => {
		if (typeof document !== "undefined") {
			const div = document.createElement("div");
			document.body.appendChild(div);

			// Render a Dialog with a nested open Select
			div.innerHTML = (
				<Dialog.Root open={true} id="parent-dialog">
					<Dialog.Content>
						<div id="nested-select" data-overlay-root data-state="open">
							<button>Select Button</button>
						</div>
					</Dialog.Content>
				</Dialog.Root>
			).toString();

			const root = div.querySelector("#parent-dialog") as HTMLElement;
			expect(root).not.toBeNull();
			expect(hasOpenNested(root)).toBe(true);

			// Now check with closed nested overlay
			div.innerHTML = (
				<Dialog.Root open={true} id="parent-dialog">
					<Dialog.Content>
						<div id="nested-select" data-overlay-root data-state="closed">
							<button>Select Button</button>
						</div>
					</Dialog.Content>
				</Dialog.Root>
			).toString();

			const rootClosed = div.querySelector("#parent-dialog") as HTMLElement;
			expect(hasOpenNested(rootClosed)).toBe(false);

			document.body.removeChild(div);
		}
	});
});
