import { cx } from "design-system/css";
import type { CodeVariantProps } from "design-system/recipes";
import { code } from "design-system/recipes";
import type { PropsWithChildren } from "hono/jsx";

interface CodeProps
	extends CodeVariantProps,
		PropsWithChildren<{
			class?: string;
			colorPalette?:
				| "blue"
				| "green"
				| "red"
				| "purple"
				| "orange"
				| "cyan"
				| "yellow"
				| "pink"
				| "teal"
				| "indigo"
				| "gray"
				| "success"
				| "error"
				| "warning";
			[key: string]: unknown;
		}> {}

function Code(props: CodeProps) {
	const [variantProps, localProps] = code.splitVariantProps(props);
	const { children, class: classProp, colorPalette, ...restProps } = localProps;

	return (
		<code
			class={cx(code(variantProps), classProp)}
			style={colorPalette ? `--color-palette: ${colorPalette};` : undefined}
			{...restProps}
		>
			{children}
		</code>
	);
}

export { Code, type CodeProps };
