import { cx } from "design-system/css";
import type { HeadingVariantProps } from "design-system/recipes";
import { heading } from "design-system/recipes";
import type { Child, ElementType } from "hono/jsx";

export interface HeadingProps extends HeadingVariantProps {
	as?: ElementType;
	children?: Child;
	class?: string;
	[key: string]: unknown;
}

export function Heading(props: HeadingProps) {
	const [variantProps, localProps] = heading.splitVariantProps(props);
	const {
		as: Component = "h2",
		children,
		class: classProp,
		...restProps
	} = localProps;

	return (
		<Component class={cx(heading(variantProps), classProp)} {...restProps}>
			{children}
		</Component>
	);
}
