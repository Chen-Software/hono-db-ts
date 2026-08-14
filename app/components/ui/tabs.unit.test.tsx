import { describe, expect, test } from "bun:test";
import { Tabs } from "./tabs";

describe("Tabs Unit Tests", () => {
	test("should render compound API correctly", () => {
		const html = (
			<Tabs defaultValue="tab-1">
				<Tabs.List>
					<Tabs.Trigger value="tab-1">Tab 1</Tabs.Trigger>
					<Tabs.Trigger value="tab-2">Tab 2</Tabs.Trigger>
					<Tabs.Indicator />
				</Tabs.List>
				<Tabs.Content value="tab-1">Content 1</Tabs.Content>
				<Tabs.Content value="tab-2">Content 2</Tabs.Content>
			</Tabs>
		).toString();

		expect(html).toContain('data-part="root"');
		expect(html).toContain('data-part="list"');
		expect(html).toContain('data-part="trigger"');
		expect(html).toContain('data-value="tab-1"');
		expect(html).toContain('data-value="tab-2"');
		expect(html).toContain('data-part="indicator"');
		expect(html).toContain('data-part="content"');
		expect(html).toContain("Content 1");
		// Content 2 is inactive, but since lazyMount is not set, it is rendered in server primitives but has hidden and display: "none"
		expect(html).toContain("Content 2");
		expect(html).toContain('style="display:none"');
	});

	test("should support lazyMount correctly", () => {
		const html = (
			<Tabs defaultValue="tab-1" lazyMount>
				<Tabs.List>
					<Tabs.Trigger value="tab-1">Tab 1</Tabs.Trigger>
					<Tabs.Trigger value="tab-2">Tab 2</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="tab-1">Content 1</Tabs.Content>
				<Tabs.Content value="tab-2">Content 2</Tabs.Content>
			</Tabs>
		).toString();

		expect(html).toContain("Content 1");
		// Since tab-2 is inactive and lazyMount is enabled, Content 2 should not be rendered
		expect(html).not.toContain("Content 2");
	});

	test("should render as an island when interactive", () => {
		const html = (
			<Tabs defaultValue="tab-1" interactive>
				<Tabs.List>
					<Tabs.Trigger value="tab-1">Tab 1</Tabs.Trigger>
					<Tabs.Trigger value="tab-2">Tab 2</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="tab-1">Content 1</Tabs.Content>
			</Tabs>
		).toString();

		expect(html).toContain('data-hydrated="true"');
	});

	test("should support unmountOnExit correctly", () => {
		const html = (
			<Tabs defaultValue="tab-1" unmountOnExit>
				<Tabs.List>
					<Tabs.Trigger value="tab-1">Tab 1</Tabs.Trigger>
					<Tabs.Trigger value="tab-2">Tab 2</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="tab-1">Content 1</Tabs.Content>
				<Tabs.Content value="tab-2">Content 2</Tabs.Content>
			</Tabs>
		).toString();

		expect(html).toContain("Content 1");
		expect(html).not.toContain("Content 2");
	});

	test("should support preserving previously mounted tabs when lazyMount is true but unmountOnExit is false", () => {
		// Simulate client side having visited tab-2 previously
		const html = (
			<Tabs defaultValue="tab-1" lazyMount mountedValues={["tab-1", "tab-2"]}>
				<Tabs.List>
					<Tabs.Trigger value="tab-1">Tab 1</Tabs.Trigger>
					<Tabs.Trigger value="tab-2">Tab 2</Tabs.Trigger>
					<Tabs.Trigger value="tab-3">Tab 3</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="tab-1">Content 1</Tabs.Content>
				<Tabs.Content value="tab-2">Content 2</Tabs.Content>
				<Tabs.Content value="tab-3">Content 3</Tabs.Content>
			</Tabs>
		).toString();

		expect(html).toContain("Content 1");
		expect(html).toContain("Content 2"); // Preserved in DOM
		expect(html).not.toContain("Content 3"); // Never visited, not rendered
	});

	test("should completely unmount inactive tabs when unmountOnExit is true even if previously mounted", () => {
		// Even if tab-2 is in mountedValues, unmountOnExit takes priority and unmounts it because it is not currently active
		const html = (
			<Tabs
				defaultValue="tab-1"
				unmountOnExit
				mountedValues={["tab-1", "tab-2"]}
			>
				<Tabs.List>
					<Tabs.Trigger value="tab-1">Tab 1</Tabs.Trigger>
					<Tabs.Trigger value="tab-2">Tab 2</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="tab-1">Content 1</Tabs.Content>
				<Tabs.Content value="tab-2">Content 2</Tabs.Content>
			</Tabs>
		).toString();

		expect(html).toContain("Content 1");
		expect(html).not.toContain("Content 2");
	});

	test("should assign tabIndex={0} to selected tabpanel content and tabIndex={-1} to non-selected", () => {
		const html = (
			<Tabs defaultValue="tab-1">
				<Tabs.List>
					<Tabs.Trigger value="tab-1">Tab 1</Tabs.Trigger>
					<Tabs.Trigger value="tab-2">Tab 2</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="tab-1">Content 1</Tabs.Content>
				<Tabs.Content value="tab-2">Content 2</Tabs.Content>
			</Tabs>
		).toString();

		expect(html).toContain('tabIndex="0"');
		expect(html).toContain('tabIndex="-1"');
	});
});
