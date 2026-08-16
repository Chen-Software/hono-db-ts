import { cx } from "design-system/css";
import type { ButtonVariantProps } from "design-system/recipes";
import { button } from "design-system/recipes";
import type { Child, ElementType, PropsWithChildren } from "hono/jsx";
import { createContext, useContext } from "hono/jsx";
import type { ColorPalette } from "./color-palette";
import { colorPaletteClass } from "./color-palette";
import { Group, type GroupProps } from "./group";
import { Loader } from "./loader";

const ButtonContext = createContext<
	ButtonVariantProps & { colorPalette?: ColorPalette }
>({});

interface ButtonLoadingProps {
	loading?: boolean;
	loadingText?: Child;
	spinner?: Child;
	spinnerPlacement?: "start" | "end";
}

interface ButtonProps
	extends ButtonVariantProps,
		ButtonLoadingProps,
		PropsWithChildren<{
			class?: string;
			as?: ElementType;
			type?: "button" | "submit" | "reset";
			disabled?: boolean;
			interactive?: boolean;
			colorPalette?: ColorPalette;
			[key: string]: unknown;
		}> {}

function Button(props: ButtonProps) {
	const groupVariantProps = useContext(ButtonContext);
	const mergedProps = { ...groupVariantProps, ...props };
	const [variantProps, localProps] = button.splitVariantProps(mergedProps);
	const {
		as: Component = "button",
		loading,
		loadingText,
		children,
		spinner,
		spinnerPlacement,
		class: classProp,
		type = "button",
		disabled,
		interactive,
		colorPalette,
		...rest
	} = localProps;

	const className = cx(
		button(variantProps),
		colorPaletteClass(colorPalette as string | undefined),
		classProp,
	);

	const content = loading ? (
		<Loader
			spinner={spinner}
			text={loadingText}
			spinnerPlacement={spinnerPlacement}
		>
			{children}
		</Loader>
	) : (
		children
	);

	// Shared attributes for both the native button and any `as` element (e.g. an
	// `<a>` link). `disabled` is omitted here: it only applies to form controls,
	// so the disabled state is surfaced via `aria-disabled` + `data-loading`.
	const commonProps: Record<string, unknown> = {
		class: className,
		"aria-busy": loading,
		"aria-disabled": loading || disabled,
		"data-loading": loading ? "" : undefined,
		...rest,
	};

	if (Component !== "button") {
		// Non-button element (e.g. Anchor). `type` is a button-only attribute
		// and must not leak onto elements like `<a>`.
		return <Component {...commonProps}>{content}</Component>;
	}

	return (
		<button type={type} disabled={loading || disabled} {...commonProps}>
			{content}
		</button>
	);
}

interface ButtonGroupProps extends GroupProps, ButtonVariantProps {
	colorPalette?: ColorPalette;
}

function ButtonGroup(props: ButtonGroupProps) {
	const [variantProps, localProps] = button.splitVariantProps(props);
	const { children, colorPalette, ...rest } = localProps;

	return (
		<ButtonContext.Provider value={{ ...variantProps, colorPalette }}>
			<Group {...(rest as Record<string, unknown>)}>{children}</Group>
		</ButtonContext.Provider>
	);
}

export {
	Button,
	ButtonGroup,
	type ButtonGroupProps,
	type ButtonLoadingProps,
	type ButtonProps,
};
