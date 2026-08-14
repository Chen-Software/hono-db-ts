import { cx } from "design-system/css";
import type { GroupVariantProps } from "design-system/recipes";
import { group } from "design-system/recipes";
import type { PropsWithChildren } from "hono/jsx";

export interface GroupProps
	extends GroupVariantProps,
		PropsWithChildren<{
			class?: string;
		}> {}

export function Group(props: GroupProps) {
	const [variantProps, localProps] = group.splitVariantProps(props);
	const { children, class: classProp, ...restProps } = localProps;

	return (
		<div class={cx(group(variantProps), classProp)} {...restProps}>
			{children}
		</div>
	);
}
