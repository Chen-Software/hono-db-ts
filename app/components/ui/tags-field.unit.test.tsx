import { expect, test } from "bun:test";
import { TagsField } from "./tags-field";

test("TagsField renders with default value", () => {
	const html = (
		<TagsField label="Frameworks" defaultValue={["React", "Solid"]} />
	).toString();

	expect(html).toContain('data-part="root"');
	expect(html).toContain('data-part="label"');
	expect(html).toContain("Frameworks");
	expect(html).toContain('data-value="React"');
	expect(html).toContain('data-value="Solid"');
	expect(html).toContain('value="React,Solid"');
});

test("TagsField renders interactive island when onValueChange is provided", () => {
	const html = (
		<TagsField
			label="Frameworks"
			defaultValue={["React"]}
			onValueChange={() => {}}
		/>
	).toString();

	// In our implementation, islands add data-interactive="true"
	expect(html).toContain('data-interactive="true"');
});

test("TagsField renders helper text", () => {
	const html = (
		<TagsField
			label="Frameworks"
			defaultValue={["React"]}
			helperText="Press Enter to add a tag"
		/>
	).toString();

	expect(html).toContain('data-part="helper-text"');
	expect(html).toContain("Press Enter to add a tag");
});

test("TagsField renders error text only when invalid", () => {
	const validHtml = (
		<TagsField
			label="Frameworks"
			defaultValue={["React"]}
			errorText="At least one tag is required"
		/>
	).toString();
	expect(validHtml).not.toContain('data-part="error-text"');

	const invalidHtml = (
		<TagsField
			label="Frameworks"
			defaultValue={["React"]}
			invalid
			errorText="At least one tag is required"
		/>
	).toString();
	expect(invalidHtml).toContain('data-part="error-text"');
	expect(invalidHtml).toContain("At least one tag is required");
});
