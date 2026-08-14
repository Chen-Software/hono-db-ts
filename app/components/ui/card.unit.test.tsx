import { expect, test } from "bun:test";
import { Card } from "./card";

test("Card renders basic content", () => {
	const html = (
		<Card title="Test Title" description="Test Description">
			<p>Test Content</p>
		</Card>
	).toString();

	expect(html).toContain("Test Title");
	expect(html).toContain("Test Description");
	expect(html).toContain("Test Content");
});

test("Card renders image", () => {
	const html = (<Card image="test-image.jpg" title="Image Card" />).toString();

	expect(html).toContain('<img src="test-image.jpg"');
});

test("Card renders image with different positions", () => {
	const htmlLeft = (
		<Card image="test-image.jpg" title="Image Card" imagePosition="left" />
	).toString();
	expect(htmlLeft).toContain('<img src="test-image.jpg"');
	expect(htmlLeft).toContain("card__image");

	const htmlRight = (
		<Card image="test-image.jpg" title="Image Card" imagePosition="right" />
	).toString();
	expect(htmlRight).toContain('<img src="test-image.jpg"');
});

test("Card renders footer", () => {
	const html = (
		<Card title="Footer Card" footer={<button type="button">Action</button>} />
	).toString();

	expect(html).toContain("Footer Card");
	expect(html).toContain("<button");
	expect(html).toContain("Action");
});
