import { cx } from "design-system/css";
import type { TextVariantProps } from "design-system/recipes";
import { text } from "design-system/recipes";
import type { Child, ElementType } from "hono/jsx";

export interface TextProps extends TextVariantProps {
	as?: ElementType;
	children?: Child;
	class?: string;
	[key: string]: unknown;
}

export function Text(props: TextProps) {
	const [variantProps, localProps] = text.splitVariantProps(props);
	const {
		as: Component = "p",
		children,
		class: classProp,
		...restProps
	} = localProps;

	return (
		<Component class={cx(text(variantProps), classProp)} {...restProps}>
			{children}
		</Component>
	);
}
