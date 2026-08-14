import { cx } from "design-system/css";
import { type StackProperties, stack } from "design-system/patterns";
import {
	cloneElement,
	type ElementType,
	type PropsWithChildren,
} from "hono/jsx";

/**
 * Breakpoints accepted for responsive prop values. Mirrors Panda's default
 * responsive conditions (sm/md/lg/xl/2xl) — see `panda.config.ts`.
 */
type Breakpoint = "base" | "sm" | "md" | "lg" | "xl" | "2xl";

/** A value that is either static or resolved per breakpoint. */
export type Responsive<T> = T | Partial<Record<Breakpoint, T>>;

type DirectionValue =
	| "row"
	| "column"
	| "row-reverse"
	| "column-reverse"
	| "horizontal"
	| "vertical";

type AlignValue =
	| "start"
	| "center"
	| "end"
	| "stretch"
	| "baseline"
	| "flex-start"
	| "flex-end";

type JustifyValue =
	| "start"
	| "center"
	| "end"
	| "between"
	| "around"
	| "evenly"
	| "flex-start"
	| "flex-end"
	| "space-between"
	| "space-around"
	| "space-evenly";

type WrapValue = "wrap" | "nowrap" | "wrap-reverse";

/**
 * Resolve a static-or-responsive prop, mapping each leaf value through `map`.
 * This lets us keep the friendly `horizontal`/`vertical` (etc.) shorthands
 * while still accepting per-breakpoint overrides such as
 * `{ base: "column", md: "row" }`.
 */
function resolveResponsive(
	value: unknown,
	map: (value: string) => string,
): string | Partial<Record<Breakpoint, string>> | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value === "boolean") {
		return map(value ? "wrap" : "nowrap");
	}
	if (typeof value === "object") {
		const out: Partial<Record<Breakpoint, string>> = {};
		for (const key of Object.keys(value) as Breakpoint[]) {
			const leaf = (value as Record<string, unknown>)[key];
			if (leaf !== undefined) {
				const stringLeaf =
					typeof leaf === "boolean" ? (leaf ? "wrap" : "nowrap") : String(leaf);
				out[key] = map(stringLeaf);
			}
		}
		return out;
	}
	return map(String(value));
}

const DIRECTION = {
	horizontal: "row",
	vertical: "column",
} as const;

const ALIGN = {
	start: "flex-start",
	end: "flex-end",
	center: "center",
	stretch: "stretch",
	baseline: "baseline",
} as const;

const JUSTIFY = {
	start: "flex-start",
	end: "flex-end",
	center: "center",
	between: "space-between",
	around: "space-around",
	evenly: "space-evenly",
} as const;

export interface StackProps
	extends PropsWithChildren<{
		class?: string;
		/** Render as a different element/component (e.g. "ul", "ol", "section"). */
		as?: ElementType;
		/** Merge the stack styles onto a single child element. */
		asChild?: boolean;
		/**
		 * Alias for `flex-direction`. Defaults to `horizontal` (row).
		 * Responsive: `{ base: "column", md: "row" }`.
		 */
		direction?: Responsive<DirectionValue>;
		/** Gap between children. Accepts spacing tokens and is responsive. */
		gap?: StackProperties["gap"];
		/** Alias for `align-items`. */
		align?: Responsive<AlignValue>;
		/** Alias for `justify-content`. */
		justify?: Responsive<JustifyValue>;
		/** `flex-wrap` convenience. Can be a wrap value string or a boolean shortcut. */
		wrap?:
			| Responsive<WrapValue>
			| boolean
			| Partial<Record<Breakpoint, WrapValue | boolean>>;
		[key: string]: unknown;
	}> {}

export function Stack(props: StackProps) {
	const {
		as: Component = "div",
		asChild,
		children,
		class: classProp,
		direction,
		gap,
		align,
		justify,
		wrap,
		...rest
	} = props;

	const styles = {
		direction: resolveResponsive(direction ?? "horizontal", (v) => {
			return DIRECTION[v as keyof typeof DIRECTION] ?? v;
		}),
		gap: gap ?? "2",
		align: align
			? resolveResponsive(align, (v) => ALIGN[v as keyof typeof ALIGN] ?? v)
			: undefined,
		justify: justify
			? resolveResponsive(
					justify,
					(v) => JUSTIFY[v as keyof typeof JUSTIFY] ?? v,
				)
			: undefined,
		flexWrap:
			wrap !== undefined ? resolveResponsive(wrap, (v) => v) : undefined,
	};

	const className = cx(stack(styles as Parameters<typeof stack>[0]), classProp);

	if (asChild && typeof children === "object" && children !== null) {
		const child = children as JSX.Element;
		return cloneElement(child, {
			...rest,
			class: cx(className, child.props?.class),
		});
	}

	return (
		<Component class={className} {...rest}>
			{children}
		</Component>
	);
}
