import { cx } from "design-system/css";
import type { ToastVariantProps } from "design-system/recipes";
import { toast as toastRecipe } from "design-system/recipes";
import type { Child, PropsWithChildren } from "hono/jsx";
import { cloneElement, createContext, useContext } from "hono/jsx";
import { AlertTriangleIcon } from "../../icons/alert-triangle";
import { CheckCircleIcon } from "../../icons/check-circle";
import { InfoIcon } from "../../icons/info";
import { XCircleIcon } from "../../icons/x-circle";
import { Spinner } from "./spinner";

type ToastStyles = ReturnType<typeof toastRecipe>;
export type SwipeDirection = "up" | "down" | "left" | "right";

export interface ToastContextValue {
	styles?: ToastStyles;
	toast?: {
		id: string;
		title?: string;
		description?: string;
		type?: "info" | "success" | "warning" | "error" | "loading";
		duration?: number;
		closable?: boolean;
		action?: {
			label: string;
			onClick: () => void;
		};
	};
	dismiss?: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export const useToastContext = () => {
	const context = useContext(ToastContext);
	return context;
};

export interface TitleProps extends PropsWithChildren {
	class?: string;
}

export function Title(props: TitleProps) {
	const { children, class: classProp, ...rest } = props;
	const context = useToastContext();
	const styles = context?.styles || toastRecipe();
	const content = children ?? context?.toast?.title;

	return (
		<div
			data-scope="toast"
			data-part="title"
			class={cx(styles.title, classProp)}
			{...rest}
		>
			{content}
		</div>
	);
}

export interface DescriptionProps extends PropsWithChildren {
	class?: string;
}

export function Description(props: DescriptionProps) {
	const { children, class: classProp, ...rest } = props;
	const context = useToastContext();
	const styles = context?.styles || toastRecipe();
	const content = children ?? context?.toast?.description;

	return (
		<div
			data-scope="toast"
			data-part="description"
			class={cx(styles.description, classProp)}
			{...rest}
		>
			{content}
		</div>
	);
}

export interface ActionTriggerProps extends PropsWithChildren {
	class?: string;
	asChild?: boolean;
	onClick?: (e: unknown) => void;
}

export function ActionTrigger(props: ActionTriggerProps) {
	const { children, class: classProp, asChild, onClick, ...rest } = props;
	const context = useToastContext();
	const styles = context?.styles || toastRecipe();

	const content = children ?? context?.toast?.action?.label;

	const triggerProps = {
		"data-scope": "toast",
		"data-part": "action-trigger",
		class: cx(styles.actionTrigger, classProp),
		onClick: (e: unknown) => {
			if (onClick) onClick(e);
			if (context?.toast?.action?.onClick) {
				context.toast.action.onClick();
			}
			if (context?.toast?.id && context.dismiss) {
				context.dismiss(context.toast.id);
			}
		},
		...rest,
	};

	if (asChild && typeof children === "object" && children !== null) {
		const child = children as Record<string, unknown>;
		const childProps = (child.props as Record<string, unknown>) || {};
		return cloneElement(child as Parameters<typeof cloneElement>[0], {
			...triggerProps,
			class: cx(triggerProps.class, childProps.class as string),
		});
	}

	return (
		<button type="button" {...triggerProps}>
			{content}
		</button>
	);
}

export interface CloseTriggerProps extends PropsWithChildren {
	class?: string;
	asChild?: boolean;
	onClick?: (e: unknown) => void;
}

export function CloseTrigger(props: CloseTriggerProps) {
	const { children, class: classProp, asChild, onClick, ...rest } = props;
	const context = useToastContext();
	const styles = context?.styles || toastRecipe();

	const triggerProps = {
		"data-scope": "toast",
		"data-part": "close-trigger",
		class: cx(styles.closeTrigger, classProp),
		onClick: (e: unknown) => {
			if (onClick) onClick(e);
			if (context?.toast?.id && context.dismiss) {
				context.dismiss(context.toast.id);
			}
		},
		...rest,
	};

	if (asChild && typeof children === "object" && children !== null) {
		const child = children as Record<string, unknown>;
		const childProps = (child.props as Record<string, unknown>) || {};
		return cloneElement(child as Parameters<typeof cloneElement>[0], {
			...triggerProps,
			class: cx(triggerProps.class, childProps.class as string),
		});
	}

	return (
		<button type="button" aria-label="Close" {...triggerProps}>
			{children}
		</button>
	);
}

const ICONS: Record<string, () => Child> = {
	loading: () => <Spinner size="sm" />,
	success: () => <CheckCircleIcon aria-hidden="true" />,
	error: () => <XCircleIcon aria-hidden="true" />,
	warning: () => <AlertTriangleIcon aria-hidden="true" />,
	info: () => <InfoIcon aria-hidden="true" />,
};

export interface IndicatorProps extends PropsWithChildren {
	class?: string;
}

export function Indicator(props: IndicatorProps) {
	const { children, class: classProp, ...rest } = props;
	const context = useToastContext();
	const styles = context?.styles || toastRecipe();
	const type = context?.toast?.type || "info";

	const iconContent = children ?? (ICONS[type] ?? ICONS.info)();

	return (
		<div
			data-scope="toast"
			data-part="indicator"
			data-type={type}
			class={cx(styles.indicator, classProp)}
			{...rest}
		>
			{iconContent}
		</div>
	);
}

export const Context = (props: {
	children: (context: ToastContextValue | null) => unknown;
}) => {
	const context = useToastContext();
	return props.children(context);
};
