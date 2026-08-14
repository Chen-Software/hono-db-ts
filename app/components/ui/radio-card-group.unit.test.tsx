import { describe, expect, test } from "bun:test";
import { RadioCardGroup } from "./radio-card-group";

describe("RadioCardGroup Unit Tests", () => {
	test("should render correctly", () => {
		const html = (
			<RadioCardGroup
				interactive={false}
				label="Plan"
				items={[
					{ label: "Hobby", value: "hobby" },
					{ label: "Pro", value: "pro" },
				]}
			/>
		).toString();

		expect(html).toContain('data-scope="radio-card-group"');
		expect(html).toContain('data-part="root"');
		expect(html).toContain('role="radiogroup"');
		expect(html).toContain("Plan");
		expect(html).toContain("Hobby");
		expect(html).toContain("Pro");
		expect(html).toContain('data-value="hobby"');
		expect(html).toContain('data-value="pro"');
	});

	test("should mark the default value as checked", () => {
		const html = (
			<RadioCardGroup
				interactive={false}
				defaultValue="pro"
				items={["hobby", "pro"]}
			/>
		).toString();

		expect(html).toContain('data-state="checked"');
		expect(html).toContain('aria-checked="true"');
	});

	test("should render disabled items with data-disabled", () => {
		const html = (
			<RadioCardGroup
				interactive={false}
				items={[{ label: "Enterprise", value: "enterprise", disabled: true }]}
			/>
		).toString();

		expect(html).toContain("data-disabled");
	});

	test("should render as an island when interactive", () => {
		const html = (
			<RadioCardGroup
				interactive
				items={[{ label: "Hobby", value: "hobby" }]}
			/>
		).toString();

		expect(html).toContain('data-hydrated="true"');
	});

	test("should keep variant classes on items when interactive", () => {
		const html = (
			<RadioCardGroup
				interactive
				variant="subtle"
				defaultValue="monthly"
				items={[
					{ label: "Monthly", value: "monthly" },
					{ label: "Yearly", value: "yearly" },
				]}
			/>
		).toString();

		expect(html).toContain("radio-card-group__item--variant_subtle");
		expect(html).toContain("radio-card-group__itemControl--variant_subtle");
		expect(html).not.toContain("--variant_outline");
	});

	test("should not render as an island when not interactive", () => {
		const html = (
			<RadioCardGroup
				interactive={false}
				items={[{ label: "Hobby", value: "hobby" }]}
			/>
		).toString();

		expect(html).not.toContain('data-hydrated="true"');
		expect(html).toContain('data-part="root"');
	});

	test("should support compound components", () => {
		const html = (
			<RadioCardGroup.Root defaultValue="hobby">
				<RadioCardGroup.Label>Plan</RadioCardGroup.Label>
				<RadioCardGroup.Item value="hobby">
					<RadioCardGroup.ItemText>Hobby</RadioCardGroup.ItemText>
					<RadioCardGroup.ItemControl />
					<RadioCardGroup.ItemHiddenInput />
				</RadioCardGroup.Item>
			</RadioCardGroup.Root>
		).toString();

		expect(html).toContain('data-part="root"');
		expect(html).toContain('data-part="label"');
		expect(html).toContain('data-part="item"');
		expect(html).toContain('data-part="item-text"');
		expect(html).toContain('data-part="item-control"');
		expect(html).toContain('type="radio"');
	});
});
