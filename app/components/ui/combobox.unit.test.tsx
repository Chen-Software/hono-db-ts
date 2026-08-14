import { describe, expect, test } from "bun:test";
import { Combobox } from "./combobox";

describe("Combobox Unit Tests", () => {
	test("should render correctly with flattened API (static)", () => {
		const html = (
			<Combobox
				interactive={false}
				label="Favorite Framework"
				placeholder="Select framework..."
				items={[
					{ label: "React", value: "react" },
					{ label: "Solid", value: "solid" },
				]}
			/>
		).toString();

		expect(html).toContain('data-scope="combobox"');
		expect(html).toContain('data-part="root"');
		expect(html).toContain("Favorite Framework");
		expect(html).toContain("Select framework...");
		expect(html).toContain("React");
		expect(html).toContain("Solid");
	});

	test("should support compound components for backward compatibility", () => {
		const html = (
			<Combobox.Root
				id="my-combobox"
				items={[{ label: "Hono", value: "hono" }]}
			>
				<Combobox.Label>Framework</Combobox.Label>
				<Combobox.Control>
					<Combobox.Input placeholder="Search..." />
					<Combobox.IndicatorGroup>
						<Combobox.ClearTrigger />
						<Combobox.Trigger />
					</Combobox.IndicatorGroup>
				</Combobox.Control>
				<Combobox.Positioner>
					<Combobox.Content>
						<Combobox.List>
							<Combobox.Item value="hono" index={0}>
								<Combobox.ItemText>Hono</Combobox.ItemText>
								<Combobox.ItemIndicator />
							</Combobox.Item>
						</Combobox.List>
					</Combobox.Content>
				</Combobox.Positioner>
			</Combobox.Root>
		).toString();

		expect(html).toContain('data-part="root"');
		expect(html).toContain('data-part="label"');
		expect(html).toContain('data-part="control"');
		expect(html).toContain('data-part="input"');
		expect(html).toContain('data-part="clear-trigger"');
		expect(html).toContain('data-part="trigger"');
		expect(html).toContain('data-part="positioner"');
		expect(html).toContain('data-part="content"');
		expect(html).toContain('data-part="list"');
		expect(html).toContain('data-part="item"');
		expect(html).toContain('data-part="item-text"');
		expect(html).toContain('data-part="item-indicator"');
	});

	test("should support defaultValue, selectedValue, and form submission fields (interactive)", () => {
		const html = (
			<Combobox
				interactive={true}
				name="framework"
				defaultValue="solid"
				items={[
					{ label: "React", value: "react" },
					{ label: "Solid", value: "solid" },
				]}
			/>
		).toString();

		expect(html).toContain('type="hidden"');
		expect(html).toContain('name="framework"');
		expect(html).toContain('value="solid"');
		expect(html).toContain('value="Solid"'); // The visible input should have the label "Solid"
	});

	test("should correctly bind data-index on item elements and align disabled status", () => {
		const html = (
			<Combobox
				interactive={true}
				items={[
					{ label: "React", value: "react" },
					{ label: "Vue", value: "vue", disabled: true },
					{ label: "Solid", value: "solid" },
				]}
			/>
		).toString();

		expect(html).toContain('data-part="item"');
		expect(html).toContain('data-index="0"');
		expect(html).toContain('data-index="1"');
		expect(html).toContain('data-disabled=""');
		expect(html).toContain('data-index="2"');
	});

	test("should render label, helper text, and error text via flat API", () => {
		const html = (
			<Combobox
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
		expect(html).toContain('class="combobox__requiredIndicator');
		expect(html).toContain("Please select one");
		expect(html).toContain('id="combobox-helper-text"');
		expect(html).toContain("An option is required");
		expect(html).toContain('id="combobox-error-text"');
	});

	test("should render helper text and error text via compound API", () => {
		const html = (
			<Combobox.Root
				id="my-combo"
				invalid={true}
				required={true}
				errorText="An option is required"
				items={[{ label: "Hono", value: "hono" }]}
			>
				<Combobox.Label>Framework</Combobox.Label>
				<Combobox.HelperText>Please select one</Combobox.HelperText>
				<Combobox.ErrorText />
			</Combobox.Root>
		).toString();

		expect(html).toContain("Framework");
		expect(html).toContain('class="combobox__requiredIndicator');
		expect(html).toContain("Please select one");
		expect(html).toContain("An option is required");
	});

	test("should not leak helperText or errorText to the DOM root element", () => {
		const html = (
			<Combobox
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

	test("should support multiple prop and render correct selections/inputs", () => {
		const html = (
			<Combobox
				interactive={true}
				multiple={true}
				name="frameworks"
				defaultValue={["react", "solid"]}
				items={[
					{ label: "React", value: "react" },
					{ label: "Solid", value: "solid" },
					{ label: "Vue", value: "vue" },
				]}
			/>
		).toString();

		expect(html).toContain('name="frameworks"');
		expect(html).toContain('value="react"');
		expect(html).toContain('value="solid"');
		// When multiple, initial input text remains clear (empty value)
		expect(html).toContain('data-part="input"');
		// Correct checked states for items
		expect(html).toContain(
			'data-value="React" data-item-value="react" data-state="checked"',
		);
		expect(html).toContain(
			'data-value="Solid" data-item-value="solid" data-state="checked"',
		);
		expect(html).toContain(
			'data-value="Vue" data-item-value="vue" data-state="unchecked"',
		);
	});
});
