import { cx } from "design-system/css";
import type { IconVariantProps } from "design-system/recipes";
import { icon } from "design-system/recipes";
import type { Child } from "hono/jsx";
import { cloneElement, isValidElement } from "hono/jsx";

export interface IconProps extends IconVariantProps {
	class?: string;
	children?: Child;
	/**
	 * Merge the icon's class (and any other props) onto the single child
	 * element instead of wrapping it in a new `<svg>`. Use this to compose
	 * with a hand-authored `<svg>` or an icon-library component that already
	 * renders its own root element.
	 *
	 * Ignored when `children` isn't exactly one element (e.g. bare `<path>`
	 * children, text, or multiple children) — those always render inside a
	 * generated `<svg>` wrapper instead.
	 * @default true
	 */
	asChild?: boolean;
	viewBox?: string;
	xmlns?: string;
	fill?: string;
	stroke?: string;
	"stroke-width"?: string | number;
	"stroke-linecap"?: "butt" | "round" | "square" | "inherit";
	"stroke-linejoin"?: "miter" | "round" | "bevel" | "inherit" | "arcs";
	role?: string;
	focusable?: boolean | "true" | "false";
	"aria-hidden"?: boolean | "true" | "false";
	"aria-label"?: string;
	/**
	 * Set the rendered/merged `<svg>`'s inner markup directly (e.g. raw SVG
	 * source from a CMS field) instead of passing JSX `children`.
	 */
	dangerouslySetInnerHTML?: { __html: string };
}

// Bare SVG content tags never make sense as an asChild merge target — they
// have no room for the icon's class/size props without an enclosing <svg>.
const SVG_CONTENT_TAGS = new Set([
	"path",
	"circle",
	"ellipse",
	"line",
	"polyline",
	"polygon",
	"rect",
	"g",
	"use",
	"text",
	"tspan",
	"defs",
	"mask",
	"clipPath",
	"linearGradient",
	"radialGradient",
	"stop",
	"symbol",
	"image",
	"foreignObject",
]);

function singleMergeableChild(children: Child | undefined) {
	const list = Array.isArray(children) ? children : [children];
	if (list.length !== 1) return undefined;
	const [child] = list;
	if (!isValidElement(child)) return undefined;
	if (typeof child.tag === "string" && SVG_CONTENT_TAGS.has(child.tag)) {
		return undefined;
	}
	return child;
}

export function Icon(props: IconProps) {
	const [variantProps, localProps] = icon.splitVariantProps(props);
	const {
		class: classProp,
		asChild = true,
		children,
		xmlns = "http://www.w3.org/2000/svg",
		"aria-hidden": ariaHidden,
		"aria-label": ariaLabel,
		...restProps
	} = localProps;

	const className = cx(icon(variantProps), classProp);
	const child = asChild ? singleMergeableChild(children) : undefined;

	if (child !== undefined) {
		const existingClass = (child.props as { class?: string }).class;
		return cloneElement(child, {
			...restProps,
			...(ariaHidden !== undefined && { "aria-hidden": ariaHidden }),
			...(ariaLabel !== undefined && { "aria-label": ariaLabel }),
			class: cx(className, existingClass),
		});
	}

	const resolvedAriaHidden = ariaLabel ? undefined : (ariaHidden ?? "true");
	const { dangerouslySetInnerHTML, ...svgAttrs } = restProps;

	// hono/jsx always gives an `<svg>` element exactly one internal child (a
	// namespace-context wrapper), even when it has none of its own — so
	// setting `dangerouslySetInnerHTML` directly on the `<svg>` itself always
	// trips hono's "children or dangerouslySetInnerHTML, not both" guard.
	// Setting it on a nested `<g>` instead sidesteps that internal wrapper.
	return (
		<svg
			xmlns={xmlns}
			class={className}
			aria-hidden={resolvedAriaHidden}
			aria-label={ariaLabel}
			{...svgAttrs}
		>
			{dangerouslySetInnerHTML ? (
				<g dangerouslySetInnerHTML={dangerouslySetInnerHTML} />
			) : (
				children
			)}
		</svg>
	);
}
