import { expect, test } from "bun:test";
import { RatingGroup } from "./rating-group";

test("RatingGroup - renders label, 5 items by default, and a hidden input", () => {
	const html = (
		<RatingGroup interactive={false} id="stars" label="Rate this" />
	).toString();

	expect(html).toContain("Rate this");
	expect(html.match(/data-part="item"/g)?.length).toBe(5);
	expect(html).toMatch(/type="hidden"[^>]*value="0"/);
});

test("RatingGroup - defaultValue highlights every item up to and including the value", () => {
	const html = (
		<RatingGroup interactive={false} id="stars" count={5} defaultValue={3} />
	).toString();

	expect(html).toMatch(/data-index="1"[^>]*data-highlighted=""/);
	expect(html).toMatch(/data-index="2"[^>]*data-highlighted=""/);
	expect(html).toMatch(/data-index="3"[^>]*data-highlighted=""/);
	expect(html).toMatch(/data-index="3"[^>]*data-state="checked"/);
	expect(html).not.toMatch(/data-index="4"[^>]*data-highlighted/);
	expect(html).not.toMatch(/data-index="5"[^>]*data-highlighted/);
	expect(html).toMatch(/type="hidden"[^>]*value="3"/);
});

test("RatingGroup - allowHalf renders a half-filled item at the fractional boundary", () => {
	const html = (
		<RatingGroup
			interactive={false}
			id="stars"
			count={5}
			allowHalf
			defaultValue={3.5}
		/>
	).toString();

	expect(html).toMatch(/data-index="3"[^>]*data-highlighted=""/);
	expect(html).not.toMatch(/data-index="3"[^>]*data-half/);
	expect(html).toMatch(
		/data-index="4"[^>]*data-highlighted=""[^>]*data-half=""/,
	);
	expect(html).not.toMatch(/data-index="5"[^>]*data-highlighted/);
	expect(html).toMatch(/type="hidden"[^>]*value="3.5"/);
});

test("RatingGroup - only the active item stays in the tab order", () => {
	const html = (
		<RatingGroup interactive={false} id="stars" count={5} defaultValue={2} />
	).toString();

	expect(html).toMatch(/data-index="2"[^>]*tabIndex="0"/);
	expect(html).toMatch(/data-index="1"[^>]*tabIndex="-1"/);
	expect(html).toMatch(/data-index="3"[^>]*tabIndex="-1"/);
	expect(html).toMatch(/data-index="4"[^>]*tabIndex="-1"/);
	expect(html).toMatch(/data-index="5"[^>]*tabIndex="-1"/);
});

test("RatingGroup - disabled marks the root and every item, and disables the hidden input", () => {
	const html = (
		<RatingGroup interactive={false} id="stars" count={3} disabled />
	).toString();

	expect(html).toContain('data-disabled=""');
	expect(html.match(/data-part="item"[^>]*data-disabled=""/g)?.length).toBe(3);
	expect(html).toMatch(/type="hidden"[^>]*disabled=""/);
});

test("RatingGroup - readOnly is reflected on the control and every item without disabling the input", () => {
	const html = (
		<RatingGroup interactive={false} id="stars" count={3} readOnly />
	).toString();

	expect(html).toContain('data-readonly=""');
	expect(html).toContain('aria-readonly="true"');
	expect(html).not.toMatch(/type="hidden"[^>]*disabled/);
});

test("RatingGroup - a custom icon path replaces the default star on every item", () => {
	const customPath = "M0 0 L10 10";
	const html = (
		<RatingGroup interactive={false} id="stars" count={2} icon={customPath} />
	).toString();

	expect(html.match(new RegExp(`d="${customPath}"`, "g"))?.length).toBe(4);
});

test("RatingGroup - name and form are forwarded to the hidden input", () => {
	const html = (
		<RatingGroup
			interactive={false}
			id="stars"
			name="rating"
			form="review-form"
		/>
	).toString();

	expect(html).toMatch(/type="hidden"[^>]*name="rating"/);
	expect(html).toMatch(/type="hidden"[^>]*form="review-form"/);
});

test("RatingGroup - value 0 renders no highlighted items and item 1 as the tab stop", () => {
	const html = (
		<RatingGroup interactive={false} id="stars" count={4} value={0} />
	).toString();

	expect(html).not.toContain('data-highlighted=""');
	expect(html).toMatch(/data-index="1"[^>]*tabIndex="0"/);
});
