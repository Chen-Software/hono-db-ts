import { expect, test } from "bun:test";
import { Code } from "./code";

test("Code component renders correctly with default props", async () => {
	const html = (await Code({
		children: 'console.log("hello")',
	})) as unknown as { toString: () => string };
	const htmlString = html.toString();
	expect(htmlString).toContain("<code");
	expect(htmlString).toContain(
		'class="code code--size_md code--variant_subtle"',
	);
	expect(htmlString).toContain("console.log(&quot;hello&quot;)");
});

test("Code component renders correctly with size and variant", async () => {
	const html = (await Code({
		size: "lg",
		variant: "solid",
		colorPalette: "blue",
		children: "const x = 5;",
	})) as unknown as { toString: () => string };
	const htmlString = html.toString();
	expect(htmlString).toContain("<code");
	expect(htmlString).toContain(
		'class="code code--size_lg code--variant_solid"',
	);
	expect(htmlString).toContain('style="--color-palette: blue;"');
	expect(htmlString).toContain("const x = 5;");
});
