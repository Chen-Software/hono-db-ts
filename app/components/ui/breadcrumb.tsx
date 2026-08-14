import type { BreadcrumbVariantProps } from "design-system/recipes";
import type { Child } from "hono/jsx";
import { Fragment } from "hono/jsx";
import { Item, Link, List, Root, Separator } from "./breadcrumb-primitive";

export interface BreadcrumbItem {
	/** Display text or JSX node */
	label: Child;
	/** If present, renders as <a>; otherwise renders as plain text (current page) */
	href?: string;
	/** Marks the current page. Defaults to `true` for the last item. */
	current?: boolean;
}

export interface BreadcrumbProps extends BreadcrumbVariantProps {
	items: BreadcrumbItem[];
	/** Custom separator between items. Default: ChevronRight SVG icon. */
	separator?: Child;
	class?: string;
}

export function Breadcrumb(props: BreadcrumbProps) {
	const { items, separator, class: classProp, ...rest } = props;

	return (
		<Root class={classProp} {...rest}>
			<List>
				{items.map((item, index) => {
					const isLast = index === items.length - 1;
					const isCurrent = item.current ?? isLast;

					return (
						<Fragment key={index}>
							<Item>
								{item.href && !isCurrent ? (
									<Link href={item.href}>{item.label}</Link>
								) : (
									<Link as="span" aria-current={isCurrent ? "page" : undefined}>
										{item.label}
									</Link>
								)}
							</Item>
							{!isLast && <Separator>{separator}</Separator>}
						</Fragment>
					);
				})}
			</List>
		</Root>
	);
}
