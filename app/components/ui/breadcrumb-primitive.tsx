import { cx } from "design-system/css";
import type { BreadcrumbVariantProps } from "design-system/recipes";
import { breadcrumb } from "design-system/recipes";
import type { Child, PropsWithChildren } from "hono/jsx";
import { createContext, useContext } from "hono/jsx";
import { ChevronRightIcon as ChevronRightIconImport } from "../../icons/chevron-right";

type BreadcrumbStyles = ReturnType<typeof breadcrumb>;

const BreadcrumbContext = createContext<BreadcrumbStyles | null>(null);

const useBreadcrumbContext = () => {
	const context = useContext(BreadcrumbContext);
	if (!context) {
		throw new Error(
			"Breadcrumb components must be wrapped in <Breadcrumb.Root />",
		);
	}
	return context;
};

interface RootProps extends BreadcrumbVariantProps, PropsWithChildren {
	class?: string;
}

function Root(props: RootProps) {
	const [variantProps, localProps] = breadcrumb.splitVariantProps(props);
	const { children, class: classProp, ...restProps } = localProps;
	const styles = breadcrumb(variantProps);

	return (
		<BreadcrumbContext.Provider value={styles}>
			<nav
				aria-label="breadcrumb"
				class={cx(styles.root, classProp)}
				{...restProps}
			>
				{children}
			</nav>
		</BreadcrumbContext.Provider>
	);
}

function List(props: PropsWithChildren<{ class?: string }>) {
	const styles = useBreadcrumbContext();
	return <ol class={cx(styles.list, props.class)}>{props.children}</ol>;
}

function Item(props: PropsWithChildren<{ class?: string }>) {
	const styles = useBreadcrumbContext();
	return <li class={cx(styles.item, props.class)}>{props.children}</li>;
}

interface LinkProps
	extends PropsWithChildren<{
		class?: string;
		href?: string;
		as?: "a" | "span";
		[key: string]: unknown;
	}> {}

function Link(props: LinkProps) {
	const {
		class: classProp,
		children,
		as: Component = "a",
		...restProps
	} = props;
	const styles = useBreadcrumbContext();
	return (
		<Component class={cx(styles.link, classProp)} {...restProps}>
			{children}
		</Component>
	);
}

function Separator(props: { children?: Child; class?: string }) {
	const styles = useBreadcrumbContext();
	return (
		<li aria-hidden="true" class={cx(styles.separator, props.class)}>
			{props.children || <ChevronRightIcon />}
		</li>
	);
}

function Ellipsis(props: { class?: string }) {
	const styles = useBreadcrumbContext();
	return (
		<li
			role="presentation"
			aria-hidden="true"
			class={cx(styles.ellipsis, props.class)}
		>
			...
		</li>
	);
}

function ChevronRightIcon() {
	return <ChevronRightIconImport />;
}

export type { LinkProps, RootProps };
export { Ellipsis, Item, Link, List, Root, Separator };
