import { cx } from "design-system/css";
import type { AbsoluteCenterVariantProps } from "design-system/recipes";
import { absoluteCenter } from "design-system/recipes";
import type { PropsWithChildren } from "hono/jsx";

export interface AbsoluteCenterProps
	extends AbsoluteCenterVariantProps,
		PropsWithChildren<{
			class?: string;
		}> {}

export function AbsoluteCenter(props: AbsoluteCenterProps) {
	const [variantProps, localProps] = absoluteCenter.splitVariantProps(props);
	const { children, class: classProp, ...restProps } = localProps;

	return (
		<div class={cx(absoluteCenter(variantProps), classProp)} {...restProps}>
			{children}
		</div>
	);
}
