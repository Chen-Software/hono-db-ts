import { cx } from "design-system/css";
import { grid } from "design-system/patterns";
import {
	cloneElement,
	type ElementType,
	type PropsWithChildren,
} from "hono/jsx";

type Breakpoint = "base" | "sm" | "md" | "lg" | "xl" | "2xl";

type Responsive<T> = T | Partial<Record<Breakpoint, T>>;

export interface GridProps
	extends PropsWithChildren<{
		class?: string;
		/** Render as a different element/component (e.g. "ul", "ol", "section"). */
		as?: ElementType;
		/** Merge the grid styles onto a single child element. */
		asChild?: boolean;
		/** Number of columns in the grid, or a custom CSS grid-template-columns string. Can be responsive. */
		columns?: Responsive<number | string>;
		/** Number of rows in the grid, or a custom CSS grid-template-rows string. Can be responsive. */
		rows?: Responsive<number | string>;
		/** Minimum width of a child column. Can be responsive. */
		minChildWidth?: Responsive<number | string>;
		/** Gap between cells. */
		gap?: string | number | Partial<Record<Breakpoint, string | number>>;
		/** Column gap. */
		columnGap?: string | number | Partial<Record<Breakpoint, string | number>>;
		/** Row gap. */
		rowGap?: string | number | Partial<Record<Breakpoint, string | number>>;
		[key: string]: unknown;
	}> {}

const isNumeric = (v: unknown): boolean => {
	if (typeof v === "number") return true;
	if (typeof v === "string") {
		// Checks if string is strictly numeric (e.g. "3" -> true, "auto" -> false, "1fr 2fr" -> false)
		return !Number.isNaN(Number(v)) && !Number.isNaN(parseFloat(v));
	}
	return false;
};

const formatGridTemplate = (val: unknown): string => {
	if (isNumeric(val)) {
		return `repeat(${val}, minmax(0, 1fr))`;
	}
	return String(val);
};

export function Grid(props: GridProps) {
	const {
		as: Component = "div",
		asChild,
		children,
		class: classProp,
		columns,
		rows,
		minChildWidth,
		gap,
		columnGap,
		rowGap,
		...rest
	} = props;

	// Resolve custom grid templates (rows or columns) responsively or statically
	const resolveGridTemplate = (v: unknown): unknown => {
		if (v === undefined || v === null) return undefined;
		if (typeof v === "object" && v !== null) {
			const resolved: Record<string, string> = {};
			for (const key of Object.keys(v)) {
				const val = (v as Record<string, unknown>)[key];
				resolved[key] = formatGridTemplate(val);
			}
			return resolved;
		}
		return formatGridTemplate(v);
	};

	const styles = {
		minChildWidth,
		gap: gap ?? "2",
		columnGap,
		rowGap,
		gridTemplateColumns: resolveGridTemplate(columns),
		gridTemplateRows: resolveGridTemplate(rows),
	};

	const className = cx(grid(styles as Parameters<typeof grid>[0]), classProp);

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
