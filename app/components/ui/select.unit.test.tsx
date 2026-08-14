import { describe, expect, test } from "bun:test";
import { Select } from "./select";

describe("Select Unit Tests", () => {
	test("should render correctly", () => {
		const html = (
			<Select
				interactive={false}
				label="Favorite Framework"
				placeholder="Select framework..."
				items={[
					{ label: "React", value: "react" },
					{ label: "Solid", value: "solid" },
				]}
			/>
		).toString();

		expect(html).toContain('data-scope="select"');
		expect(html).toContain('data-part="root"');
		expect(html).toContain("Favorite Framework");
		expect(html).toContain("Select framework...");
		expect(html).toContain("React");
		expect(html).toContain("Solid");
		expect(html).toContain('value="react"');
		expect(html).toContain('value="solid"');
	});

	test("should force-hydrate by default as a Tier-1 component", () => {
		const html = (
			<Select items={[{ label: "Hono", value: "hono" }]} />
		).toString();

		expect(html).toContain('data-hydrated="true"');
	});

	test("should mark the value text as placeholder when nothing is selected", () => {
		const html = (
			<Select
				interactive={false}
				placeholder="Pick one..."
				items={[{ label: "Hono", value: "hono" }]}
			/>
		).toString();

		expect(html).toContain("data-placeholder");
		expect(html).toContain("Pick one...");
	});

	test("should render the selected label instead of the placeholder", () => {
		const html = (
			<Select
				interactive={false}
				placeholder="Pick one..."
				selectedValues={["solid"]}
				items={[
					{ label: "React", value: "react" },
					{ label: "Solid", value: "solid" },
				]}
			/>
		).toString();

		expect(html).not.toContain("Pick one...");
		expect(html).not.toContain('data-placeholder=""');
		expect(html).toContain('data-state="checked"');
	});

	test("should honor defaultValue in the static render", () => {
		const html = (
			<Select
				interactive={false}
				placeholder="Pick one..."
				defaultValue={["react"]}
				items={[
					{ label: "React", value: "react" },
					{ label: "Solid", value: "solid" },
				]}
			/>
		).toString();

		expect(html).not.toContain('data-placeholder=""');
		expect(html).toContain('data-state="checked"');
	});

	test("should not nest the clear trigger inside the trigger button", () => {
		const html = (
			<Select
				interactive={false}
				allowClear
				items={[{ label: "Hono", value: "hono" }]}
			/>
		).toString();

		const triggerStart = html.indexOf('data-part="trigger"');
		const triggerEnd = html.indexOf("</button>", triggerStart);
		const clearStart = html.indexOf('data-part="clear-trigger"');

		expect(triggerStart).toBeGreaterThan(-1);
		expect(clearStart).toBeGreaterThan(triggerEnd);
	});

	test("should hide the clear trigger while nothing is selected", () => {
		const withoutSelection = (
			<Select
				interactive={false}
				allowClear
				items={[{ label: "Hono", value: "hono" }]}
			/>
		).toString();
		const withSelection = (
			<Select
				interactive={false}
				allowClear
				selectedValues={["hono"]}
				items={[{ label: "Hono", value: "hono" }]}
			/>
		).toString();

		// The opening tag of the clear-trigger button only.
		const clearOf = (html: string) => {
			const start = html.indexOf('data-part="clear-trigger"');
			return html.slice(start, html.indexOf(">", start));
		};

		expect(clearOf(withoutSelection)).toContain('hidden=""');
		expect(clearOf(withSelection)).not.toContain('hidden=""');
	});

	test("should render an accessible combobox trigger", () => {
		const html = (
			<Select
				interactive={false}
				invalid
				required
				items={[{ label: "Hono", value: "hono" }]}
			/>
		).toString();

		expect(html).toContain('role="combobox"');
		expect(html).toContain('aria-haspopup="listbox"');
		expect(html).toContain('aria-expanded="false"');
		expect(html).toContain('aria-invalid="true"');
		expect(html).toContain('aria-required="true"');
		expect(html).toContain('role="listbox"');
	});

	test("should render options as non-tabbable with full-list indices", () => {
		const html = (
			<Select
				interactive={false}
				items={[
					{ label: "React", value: "react" },
					{ label: "Solid", value: "solid", disabled: true },
					{ label: "Hono", value: "hono" },
				]}
			/>
		).toString();

		expect(html).toContain('tabIndex="-1"');
		expect(html).toContain('data-index="0"');
		expect(html).toContain('data-index="1"');
		expect(html).toContain('data-index="2"');
		expect(html).toContain('aria-disabled="true"');
	});

	test("should render a hidden native select for form submission", () => {
		const html = (
			<Select
				interactive={false}
				name="framework"
				multiple
				selectedValues={["hono"]}
				items={[
					{ label: "React", value: "react" },
					{ label: "Hono", value: "hono" },
				]}
			/>
		).toString();

		expect(html).toContain('data-part="hidden-select"');
		expect(html).toContain('name="framework"');
		expect(html).toContain("multiple");
		expect(html).toContain("selected");
	});

	test("should support compound components for backward compatibility", () => {
		const html = (
			<Select.Root items={[{ label: "Hono", value: "hono" }]}>
				<Select.Label>Framework</Select.Label>
				<Select.Control>
					<Select.Trigger>
						<Select.ValueText placeholder="Select..." />
						<Select.Indicator />
					</Select.Trigger>
				</Select.Control>
				<Select.Positioner>
					<Select.Content>
						<Select.List>
							<Select.Item value="hono" index={0}>
								<Select.ItemText>Hono</Select.ItemText>
								<Select.ItemIndicator />
							</Select.Item>
						</Select.List>
					</Select.Content>
				</Select.Positioner>
			</Select.Root>
		).toString();

		expect(html).toContain('data-part="root"');
		expect(html).toContain('data-part="label"');
		expect(html).toContain('data-part="control"');
		expect(html).toContain('data-part="trigger"');
		expect(html).toContain('data-part="value-text"');
		expect(html).toContain('data-part="indicator"');
		expect(html).toContain('data-part="positioner"');
		expect(html).toContain('data-part="content"');
		expect(html).toContain('data-part="list"');
		expect(html).toContain('data-part="item"');
		expect(html).toContain('data-part="item-text"');
		expect(html).toContain('data-part="item-indicator"');
	});

	test("should support multiple, clear, disabled and invalid attributes correctly", () => {
		const html = (
			<Select
				interactive={false}
				label="Framework"
				placeholder="Select..."
				items={[
					{ label: "Hono", value: "hono" },
					{ label: "React", value: "react" },
				]}
				multiple={true}
				allowClear={true}
				disabled={true}
				invalid={true}
			/>
		).toString();

		expect(html).toContain('data-disabled=""');
		expect(html).toContain('data-invalid=""');
		expect(html).toContain("multiple");
		expect(html).toContain('data-part="clear-trigger"');
	});

	test("should mark the value text as placeholder when nothing is selected", () => {
		const html = (
			<Select
				interactive={false}
				placeholder="Pick one..."
				items={[{ label: "Hono", value: "hono" }]}
			/>
		).toString();

		expect(html).toContain("data-placeholder");
		expect(html).toContain("Pick one...");
	});

	test("should render the selected label instead of the placeholder", () => {
		const html = (
			<Select
				interactive={false}
				placeholder="Pick one..."
				selectedValues={["solid"]}
				items={[
					{ label: "React", value: "react" },
					{ label: "Solid", value: "solid" },
				]}
			/>
		).toString();

		expect(html).not.toContain("Pick one...");
		expect(html).not.toContain('data-placeholder=""');
		expect(html).toContain('data-state="checked"');
	});

	test("should honor defaultValue in the static render", () => {
		const html = (
			<Select
				interactive={false}
				placeholder="Pick one..."
				defaultValue={["react"]}
				items={[
					{ label: "React", value: "react" },
					{ label: "Solid", value: "solid" },
				]}
			/>
		).toString();

		expect(html).not.toContain('data-placeholder=""');
		expect(html).toContain('data-state="checked"');
	});

	test("should not nest the clear trigger inside the trigger button", () => {
		const html = (
			<Select
				interactive={false}
				allowClear
				items={[{ label: "Hono", value: "hono" }]}
			/>
		).toString();

		const triggerStart = html.indexOf('data-part="trigger"');
		const triggerEnd = html.indexOf("</button>", triggerStart);
		const clearStart = html.indexOf('data-part="clear-trigger"');

		expect(triggerStart).toBeGreaterThan(-1);
		expect(clearStart).toBeGreaterThan(triggerEnd);
	});

	test("should hide the clear trigger while nothing is selected", () => {
		const withoutSelection = (
			<Select
				interactive={false}
				allowClear
				items={[{ label: "Hono", value: "hono" }]}
			/>
		).toString();
		const withSelection = (
			<Select
				interactive={false}
				allowClear
				selectedValues={["hono"]}
				items={[{ label: "Hono", value: "hono" }]}
			/>
		).toString();

		// The opening tag of the clear-trigger button only.
		const clearOf = (htmlStr: string) => {
			const start = htmlStr.indexOf('data-part="clear-trigger"');
			return htmlStr.slice(start, htmlStr.indexOf(">", start));
		};

		expect(clearOf(withoutSelection)).toContain('hidden=""');
		expect(clearOf(withSelection)).not.toContain('hidden=""');
	});

	test("should render an accessible combobox trigger", () => {
		const html = (
			<Select
				interactive={false}
				invalid
				required
				items={[{ label: "Hono", value: "hono" }]}
			/>
		).toString();

		expect(html).toContain('role="combobox"');
		expect(html).toContain('aria-haspopup="listbox"');
		expect(html).toContain('aria-expanded="false"');
		expect(html).toContain('aria-invalid="true"');
		expect(html).toContain('aria-required="true"');
		expect(html).toContain('role="listbox"');
	});

	test("should render options as non-tabbable with full-list indices", () => {
		const html = (
			<Select
				interactive={false}
				items={[
					{ label: "React", value: "react" },
					{ label: "Solid", value: "solid", disabled: true },
					{ label: "Hono", value: "hono" },
				]}
			/>
		).toString();

		expect(html).toContain('tabIndex="-1"');
		expect(html).toContain('data-index="0"');
		expect(html).toContain('data-index="1"');
		expect(html).toContain('data-index="2"');
		expect(html).toContain('aria-disabled="true"');
	});

	test("should render a hidden native select for form submission", () => {
		const html = (
			<Select
				interactive={false}
				name="framework"
				multiple
				selectedValues={["hono"]}
				items={[
					{ label: "React", value: "react" },
					{ label: "Hono", value: "hono" },
				]}
			/>
		).toString();

		expect(html).toContain('data-part="hidden-select"');
		expect(html).toContain('name="framework"');
		expect(html).toContain("multiple");
		expect(html).toContain("selected");
	});

	test("should render label, helper text, and error text via flat API", () => {
		const html = (
			<Select
				interactive={false}
				label="Framework"
				required={true}
				invalid={true}
				helperText="Please select one"
				errorText="An option is required"
				items={[{ label: "Hono", value: "hono" }]}
			/>
		).toString();

		expect(html).toContain("Framework");
		expect(html).toContain('class="select__requiredIndicator');
		expect(html).toContain("Please select one");
		expect(html).toContain('id="select-helper-text"');
		expect(html).toContain("An option is required");
		expect(html).toContain('id="select-error-text"');
	});

	test("should render helper text and error text via compound API", () => {
		const html = (
			<Select.Root
				invalid={true}
				required={true}
				errorText="An option is required"
				items={[{ label: "Hono", value: "hono" }]}
			>
				<Select.Label>Framework</Select.Label>
				<Select.HelperText>Please select one</Select.HelperText>
				<Select.ErrorText />
			</Select.Root>
		).toString();

		expect(html).toContain("Framework");
		expect(html).toContain('class="select__requiredIndicator');
		expect(html).toContain("Please select one");
		expect(html).toContain("An option is required");
	});

	test("should not leak helperText or errorText to the DOM root element", () => {
		const html = (
			<Select
				interactive={false}
				label="Framework"
				helperText="Helpful tip"
				errorText="Some error"
				items={[{ label: "Hono", value: "hono" }]}
			/>
		).toString();

		const rootStart = html.indexOf('data-part="root"');
		const rootEnd = html.indexOf(">", rootStart);
		const rootTag = html.slice(rootStart, rootEnd);

		expect(rootTag).not.toContain("helperText=");
		expect(rootTag).not.toContain("errorText=");
	});
});
