import { cx } from "design-system/css";
import type { CardVariantProps } from "design-system/recipes";
import { card } from "design-system/recipes";
import type { JSX, PropsWithChildren } from "hono/jsx";
import { createContext, useContext } from "hono/jsx";
import type { ColorPalette } from "./color-palette";
import { colorPaletteClass } from "./color-palette";

type CardStyles = ReturnType<typeof card>;

const CardContext = createContext<CardStyles | null>(null);

const useCardContext = () => {
	const context = useContext(CardContext);
	if (!context) {
		throw new Error("Card components must be wrapped in <Card.Root />");
	}
	return context;
};

interface RootProps extends CardVariantProps, PropsWithChildren {
	class?: string;
	colorPalette?: ColorPalette;
}

function Root(props: RootProps) {
	const [variantProps, localProps] = card.splitVariantProps(props);
	const { children, class: classProp, colorPalette, ...restProps } = localProps;
	const styles = card(variantProps);

	return (
		<CardContext.Provider value={styles}>
			<div
				class={cx(
					styles.root,
					colorPaletteClass(colorPalette as string | undefined),
					classProp,
				)}
				{...restProps}
			>
				{children}
			</div>
		</CardContext.Provider>
	);
}

function Header(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...restProps } = props;
	const styles = useCardContext();
	return (
		<div class={cx(styles.header, classProp)} {...restProps}>
			{children}
		</div>
	);
}

function Body(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...restProps } = props;
	const styles = useCardContext();
	return (
		<div class={cx(styles.body, classProp)} {...restProps}>
			{children}
		</div>
	);
}

function Footer(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...restProps } = props;
	const styles = useCardContext();
	return (
		<div class={cx(styles.footer, classProp)} {...restProps}>
			{children}
		</div>
	);
}

function Title(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...restProps } = props;
	const styles = useCardContext();
	return (
		<h3 class={cx(styles.title, classProp)} {...restProps}>
			{children}
		</h3>
	);
}

function Description(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...restProps } = props;
	const styles = useCardContext();
	return (
		<div class={cx(styles.description, classProp)} {...restProps}>
			{children}
		</div>
	);
}

function Image(props: {
	src?: string;
	alt?: string;
	class?: string;
	children?: JSX.Element;
}) {
	const { src, alt, class: classProp, children, ...rest } = props;
	const styles = useCardContext();
	return (
		<div class={cx(styles.image, classProp)} {...rest}>
			{children || <img src={src} alt={alt} class={cx(styles.image)} />}
		</div>
	);
}

export interface CardBaseProps extends RootProps {
	title?: string | JSX.Element;
	description?: string | JSX.Element;
	body?: string | JSX.Element;
	footer?: string | JSX.Element;
	avatar?: JSX.Element;
	headerAction?: JSX.Element;
	image?: string | JSX.Element;
	imagePosition?: "top" | "bottom" | "left" | "right";
	headerClass?: string;
	bodyClass?: string;
	footerClass?: string;
	imageClass?: string;
}

export function CardBase(props: CardBaseProps) {
	const {
		title,
		description,
		body,
		footer,
		avatar,
		headerAction,
		image,
		imagePosition = "top",
		headerClass,
		bodyClass,
		footerClass,
		imageClass,
		children,
		...rest
	} = props;

	const styles = card({ imagePosition, ...rest });

	const headerContent = (avatar || title || description || headerAction) && (
		<Header class={headerClass}>
			{avatar && <div class={styles.avatar}>{avatar}</div>}
			{(title || description) && (
				<div class={styles.content}>
					{title && <Title>{title}</Title>}
					{description && <Description>{description}</Description>}
				</div>
			)}
			{headerAction && <div class={styles.action}>{headerAction}</div>}
		</Header>
	);

	const bodyContent = (body || children) && (
		<Body class={bodyClass}>
			{body}
			{children}
		</Body>
	);

	const footerContent = footer && <Footer class={footerClass}>{footer}</Footer>;

	const imageContent = image && (
		<div class={cx(styles.image, imageClass)}>
			{typeof image === "string" ? <img src={image} alt="" /> : image}
		</div>
	);

	return (
		<Root imagePosition={imagePosition} {...rest}>
			{image && imagePosition === "top" && imageContent}
			<div
				style={{
					display: "flex",
					flexDirection:
						imagePosition === "left" || imagePosition === "right"
							? "row"
							: "column",
					flex: "1",
				}}
			>
				{image && imagePosition === "left" && imageContent}
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						flex: "1",
					}}
				>
					{headerContent}
					{bodyContent}
					{footerContent}
				</div>
				{image && imagePosition === "right" && imageContent}
			</div>
			{image && imagePosition === "bottom" && imageContent}
		</Root>
	);
}

export type { RootProps };
export { Body, Description, Footer, Header, Image, Root, Title };
