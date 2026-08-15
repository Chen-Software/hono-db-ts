import { describe, expect, test } from "bun:test";
import { Search } from "./search";

describe("Search Component Localisation", () => {
	test("should render English placeholder and defaults by default", () => {
		const html = (<Search />).toString();
		expect(html).toContain('placeholder="Search..."');
	});

	test("should render Chinese placeholder and defaults when locale is zh", () => {
		const html = (<Search locale="zh" />).toString();
		expect(html).toContain('placeholder="搜索..."');
	});

	test("should render Spanish placeholder and defaults when locale is es", () => {
		const html = (<Search locale="es" />).toString();
		expect(html).toContain('placeholder="Buscar..."');
	});

	test("should render Portuguese placeholder and defaults when locale is pt", () => {
		const html = (<Search locale="pt" />).toString();
		expect(html).toContain('placeholder="Buscar..."');
	});

	test("should render French placeholder and defaults when locale is fr", () => {
		const html = (<Search locale="fr" />).toString();
		expect(html).toContain('placeholder="Rechercher..."');
	});

	test("should honor explicit placeholder override even with non-en locale", () => {
		const html = (
			<Search locale="zh" placeholder="Custom Placeholder" />
		).toString();
		expect(html).toContain('placeholder="Custom Placeholder"');
	});

	test("should apply slot recipe classes correctly in static rendering", () => {
		const html = (<Search interactive={false} />).toString();
		expect(html).toContain("search__root"); // styles.root should have class "search__root"
		expect(html).toContain("search__inputWrap"); // styles.inputWrap
		expect(html).toContain("search__input"); // styles.input
	});

	test("should render interactive search as a hydrated island and forward placeholder/initialQuery", () => {
		const html = (
			<Search
				interactive={true}
				size="sm"
				variant="subtle"
				placeholder="Find threads"
				initialQuery="Hono"
			/>
		).toString();

		expect(html).toContain('placeholder="Find threads"');
		expect(html).toContain('value="Hono"');
		expect(html).toContain("Search"); // the island's submit button
		// Recipe classes are a static-rendering (SearchBase) feature; the
		// hydrated island keeps its own layout, so none appear here.
		expect(html).not.toContain("search__root");
	});
});
