import { describe, expect, test } from "bun:test";
import { Drawer } from "./drawer";

describe("Drawer Unit Tests", () => {
	test("should render flattened API correctly", () => {
		const html = (
			<Drawer
				trigger={<button type="button">Open</button>}
				title="Drawer Title"
				description="Drawer Description"
				body="Body content"
				cancel={<button type="button">Close</button>}
			/>
		).toString();

		expect(html).toContain('data-part="trigger"');
		expect(html).toContain("Open");
		expect(html).toContain('data-part="content"');
		expect(html).toContain("Drawer Title");
		expect(html).toContain("Drawer Description");
		expect(html).toContain("Body content");
		expect(html).toContain("Close");
		expect(html).toContain('data-part="close-trigger"');
	});

	test("should expose compound namespace on main export", () => {
		expect(Drawer.Root).toBeDefined();
		expect(Drawer.Trigger).toBeDefined();
		expect(Drawer.Backdrop).toBeDefined();
		expect(Drawer.Positioner).toBeDefined();
		expect(Drawer.Content).toBeDefined();
		expect(Drawer.Header).toBeDefined();
		expect(Drawer.Body).toBeDefined();
		expect(Drawer.Footer).toBeDefined();
		expect(Drawer.Title).toBeDefined();
		expect(Drawer.Description).toBeDefined();
		expect(Drawer.CloseTrigger).toBeDefined();
		expect(Drawer.ActionTrigger).toBeDefined();
	});

	test("should render compound components correctly", () => {
		const html = (
			<Drawer.Root open={true}>
				<Drawer.Trigger>Open Trigger</Drawer.Trigger>
				<Drawer.Backdrop />
				<Drawer.Positioner>
					<Drawer.Content>
						<Drawer.Header>
							<Drawer.Title>My Title</Drawer.Title>
							<Drawer.Description>My Description</Drawer.Description>
						</Drawer.Header>
						<Drawer.Body>My Body</Drawer.Body>
						<Drawer.Footer>
							<Drawer.CloseTrigger>Close Me</Drawer.CloseTrigger>
							<Drawer.ActionTrigger>Action Me</Drawer.ActionTrigger>
						</Drawer.Footer>
					</Drawer.Content>
				</Drawer.Positioner>
			</Drawer.Root>
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
});
