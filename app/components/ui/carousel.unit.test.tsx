import { describe, expect, test } from "bun:test";
import { Carousel } from "./carousel";

const slides = [
	<div>One</div>,
	<div>Two</div>,
	<div>Three</div>,
	<div>Four</div>,
];

describe("Carousel Unit Tests", () => {
	test("should render the region with carousel semantics", () => {
		const html = (<Carousel interactive={false} slides={slides} />).toString();

		expect(html).toContain('role="region"');
		expect(html).toContain('aria-roledescription="carousel"');
		expect(html).toContain('data-part="root"');
		expect(html).toContain('data-orientation="horizontal"');
	});

	test("should render one item per slide with index and in-view state", () => {
		const html = (<Carousel interactive={false} slides={slides} />).toString();

		expect(html).toContain('data-part="item"');
		expect(html).toContain('data-index="0"');
		expect(html).toContain('data-index="3"');
		expect(html).toContain('role="group"');
		expect(html).toContain('aria-roledescription="slide"');
		// Only the first slide is in view by default (slidesPerPage=1).
		expect(html).toContain('data-inview=""');
		expect(html).toContain('aria-hidden="true"');
	});

	test("should render an indicator per page, current on the active page", () => {
		const html = (<Carousel interactive={false} slides={slides} />).toString();

		expect(html).toContain('data-part="indicator"');
		expect(html).toContain('data-index="0"');
		expect(html).toContain('data-current=""');
	});

	test("should disable prev trigger on the first page without loop", () => {
		const html = (<Carousel interactive={false} slides={slides} />).toString();

		expect(html).toContain('data-part="prev-trigger"');
		expect(html).toContain('data-part="next-trigger"');
		expect(html).toMatch(/<button[^>]*data-part="prev-trigger"[^>]*>/);
		const [prevTriggerTag] =
			html.match(/<button[^>]*data-part="prev-trigger"[^>]*>/) ?? [];
		expect(prevTriggerTag).toContain("disabled");
	});

	test("should keep prev trigger enabled on the first page when looping", () => {
		const html = (
			<Carousel interactive={false} slides={slides} loop />
		).toString();

		const [prevTriggerTag] =
			html.match(/<button[^>]*data-part="prev-trigger"[^>]*>/) ?? [];
		expect(prevTriggerTag).not.toContain("disabled");
	});

	test("should show multiple slides in view when slidesPerPage > 1", () => {
		const html = (
			<Carousel interactive={false} slides={slides} slidesPerPage={2} />
		).toString();

		const inViewCount = html.split('data-inview=""').length - 1;
		expect(inViewCount).toBe(2);
	});

	test("should mark vertical orientation on every part", () => {
		const html = (
			<Carousel interactive={false} slides={slides} orientation="vertical" />
		).toString();

		expect(html).toContain('data-orientation="vertical"');
		expect(html).not.toContain('data-orientation="horizontal"');
	});

	test("should support manual composition via exported parts", () => {
		const html = (
			<Carousel.Root interactive={false} slideCount={2}>
				<Carousel.ItemGroup>
					<Carousel.Item index={0}>A</Carousel.Item>
					<Carousel.Item index={1}>B</Carousel.Item>
				</Carousel.ItemGroup>
				<Carousel.Control>
					<Carousel.PrevTrigger />
					<Carousel.IndicatorGroup />
					<Carousel.NextTrigger />
				</Carousel.Control>
			</Carousel.Root>
		).toString();

		expect(html).toContain('data-part="item-group"');
		expect(html).toContain(">A<");
		expect(html).toContain(">B<");
		expect(html).toContain('data-part="control"');
	});

	test("should omit controls and indicators when disabled", () => {
		const html = (
			<Carousel
				interactive={false}
				slides={slides}
				showControls={false}
				showIndicators={false}
			/>
		).toString();

		expect(html).not.toContain('data-part="control"');
		expect(html).not.toContain('data-part="prev-trigger"');
		expect(html).not.toContain('data-part="indicator"');
	});
});
