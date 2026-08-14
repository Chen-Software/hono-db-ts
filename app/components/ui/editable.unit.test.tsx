import { describe, expect, test } from "bun:test";
import { Editable } from "./editable";

describe("Editable Unit Tests", () => {
	test("should render correctly", () => {
		const html = (
			<Editable interactive={false} label="Name" defaultValue="Segun Adebayo" />
		).toString();

		expect(html).toContain('data-scope="editable"');
		expect(html).toContain('data-part="root"');
		expect(html).toContain('data-part="label"');
		expect(html).toContain('data-part="preview"');
		expect(html).toContain('data-part="input"');
		expect(html).toContain("Segun Adebayo");
		expect(html).toContain("Name");
	});

	test("should render the placeholder when the value is empty", () => {
		const html = (
			<Editable interactive={false} placeholder="Enter your name" />
		).toString();

		expect(html).toContain("Enter your name");
		expect(html).toContain('data-placeholder-shown=""');
	});

	test("should start in edit mode when defaultEdit is set", () => {
		const html = (
			<Editable interactive={false} defaultValue="Segun" defaultEdit />
		).toString();

		expect(html).toContain('data-part="input"');
		expect(html).not.toContain('data-part="input" hidden');
	});

	test("should mark disabled state", () => {
		const html = (
			<Editable interactive={false} defaultValue="Segun" disabled />
		).toString();

		expect(html).toContain('data-disabled=""');
	});

	test("should render as an island when interactive", () => {
		const html = (<Editable defaultValue="Segun" />).toString();

		expect(html).toContain('data-hydrated="true"');
	});

	test("should not render as an island when explicitly not interactive", () => {
		const html = (
			<Editable interactive={false} defaultValue="Segun" />
		).toString();

		expect(html).not.toContain('data-hydrated="true"');
		expect(html).toContain('data-part="root"');
	});

	test("should support the size variant", () => {
		const html = (
			<Editable interactive={false} defaultValue="Segun" size="lg" />
		).toString();

		expect(html).toContain("editable__preview--size_lg");
		expect(html).toContain("editable__input--size_lg");
	});

	test("should support compound components", () => {
		const html = (
			<Editable.Root defaultValue="Segun">
				<Editable.Label>Name</Editable.Label>
				<Editable.Area>
					<Editable.Preview />
					<Editable.Input />
				</Editable.Area>
				<Editable.Control>
					<Editable.EditTrigger>Edit</Editable.EditTrigger>
					<Editable.SubmitTrigger>Save</Editable.SubmitTrigger>
					<Editable.CancelTrigger>Cancel</Editable.CancelTrigger>
				</Editable.Control>
			</Editable.Root>
		).toString();

		expect(html).toContain('data-part="root"');
		expect(html).toContain('data-part="label"');
		expect(html).toContain('data-part="area"');
		expect(html).toContain('data-part="preview"');
		expect(html).toContain('data-part="input"');
		expect(html).toContain('data-part="control"');
		expect(html).toContain('data-part="edit-trigger"');
		expect(html).toContain('data-part="submit-trigger"');
		expect(html).toContain('data-part="cancel-trigger"');
	});

	test("should forward form association name and form", () => {
		const html = (
			<Editable
				interactive={false}
				defaultValue="John"
				name="username"
				form="login-form"
			/>
		).toString();

		expect(html).toContain('name="username"');
		expect(html).toContain('form="login-form"');
	});

	test("should apply minWidth workaround to autoResize preview when empty", () => {
		const html = (<Editable interactive={false} autoResize />).toString();

		expect(html).toContain("min-width:3ch");
	});
});
