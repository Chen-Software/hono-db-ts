import { cx } from "design-system/css";
import type { BadgeVariantProps } from "design-system/recipes";
import { badge } from "design-system/recipes";
import type { PropsWithChildren } from "hono/jsx";
import type { ColorPalette } from "./color-palette";
import { colorPaletteClass } from "./color-palette";

export interface BadgeProps
	extends BadgeVariantProps,
		PropsWithChildren<{
			class?: string;
			colorPalette?: ColorPalette;
		}> {}

export function Badge(props: BadgeProps) {
	const [variantProps, localProps] = badge.splitVariantProps(props);
	const { children, class: classProp, colorPalette, ...restProps } = localProps;

	return (
		<div
			class={cx(
				badge(variantProps),
				colorPaletteClass(colorPalette as string | undefined),
				classProp,
			)}
			{...restProps}
		>
			{children}
		</div>
	);
}
