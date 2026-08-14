import { cx } from "design-system/css";
import type { TabsVariantProps } from "design-system/recipes";
import { tabs } from "design-system/recipes";
import {
	createContext,
	type PropsWithChildren,
	useContext,
	useId,
} from "hono/jsx";

export type TabsStyles = ReturnType<typeof tabs>;

export interface TabsContextValue {
	styles: TabsStyles;
	value?: string;
	focusedValue?: string;
	orientation: "horizontal" | "vertical";
	activationMode: "automatic" | "manual";
	loopFocus: boolean;
	lazyMount?: boolean;
	unmountOnExit?: boolean;
	rootId: string;
	onValueChange?: (details: { value: string }) => void;
	onFocusChange?: (details: { value: string }) => void;
	mountedValues?: string[];
	isMeasured?: boolean;
}

export const TabsContext = createContext<TabsContextValue | null>(null);

export const useTabsContext = () => {
	const context = useContext(TabsContext);
	if (!context) {
		return {
			styles: tabs({}),
			orientation: "horizontal",
			activationMode: "automatic",
			loopFocus: true,
			rootId: "ssr-tabs",
		} as TabsContextValue;
	}
	return context;
};

export interface RootProps extends TabsVariantProps, PropsWithChildren {
	id?: string;
	value?: string;
	defaultValue?: string;
	orientation?: "horizontal" | "vertical";
	activationMode?: "manual" | "automatic";
	loopFocus?: boolean;
	lazyMount?: boolean;
	unmountOnExit?: boolean;
	onValueChange?: (details: { value: string }) => void;
	onFocusChange?: (details: { value: string }) => void;
	class?: string;
	rootRef?: unknown;
	mountedValues?: string[];
	isMeasured?: boolean;
	[key: string]: unknown;
}

export function Root(props: RootProps) {
	const [variantProps, localProps] = tabs.splitVariantProps(props);
	const {
		children,
		id: idProp,
		value,
		defaultValue,
		orientation = "horizontal",
		activationMode = "automatic",
		loopFocus = true,
		lazyMount = false,
		unmountOnExit = false,
		onValueChange,
		onFocusChange,
		rootRef,
		class: classProp,
		mountedValues,
		isMeasured,
		...rest
	} = localProps;

	const styles = tabs(variantProps);
	const fallbackId = useId();
	const rootId = idProp || fallbackId;

	const contextValue: TabsContextValue = {
		styles,
		value: value ?? defaultValue,
		orientation,
		activationMode,
		loopFocus,
		lazyMount,
		unmountOnExit,
		rootId,
		onValueChange,
		onFocusChange,
		mountedValues,
		isMeasured,
	};

	return (
		<TabsContext.Provider value={contextValue}>
			<div
				id={rootId}
				ref={rootRef as never}
				data-scope="tabs"
				data-part="root"
				data-orientation={orientation}
				class={cx(styles.root, classProp)}
				{...rest}
			>
				{children}
			</div>
		</TabsContext.Provider>
	);
}

export interface ListProps extends PropsWithChildren {
	class?: string;
	listRef?: unknown;
	[key: string]: unknown;
}

export function List(props: ListProps) {
	const { children, class: classProp, listRef, ...rest } = props;
	const context = useTabsContext();

	return (
		<div
			ref={listRef as never}
			role="tablist"
			aria-orientation={context.orientation}
			data-scope="tabs"
			data-part="list"
			data-orientation={context.orientation}
			class={cx(context.styles.list, classProp)}
			{...rest}
		>
			{children}
		</div>
	);
}

export interface TriggerProps extends PropsWithChildren {
	value: string;
	disabled?: boolean;
	class?: string;
	[key: string]: unknown;
}

export function Trigger(props: TriggerProps) {
	const { children, value, disabled, class: classProp, ...rest } = props;
	const context = useTabsContext();

	const isSelected = context.value === value;
	const isFocused = context.focusedValue === value;
	const triggerId = `${context.rootId}-trigger-${value}`;
	const contentId = `${context.rootId}-content-${value}`;

	return (
		<button
			id={triggerId}
			type="button"
			role="tab"
			aria-selected={isSelected}
			aria-controls={contentId}
			aria-disabled={disabled}
			disabled={disabled}
			tabIndex={isSelected && !disabled ? 0 : -1}
			data-scope="tabs"
			data-part="trigger"
			data-value={value}
			data-state={isSelected ? "selected" : "unselected"}
			data-orientation={context.orientation}
			data-disabled={disabled ? "" : undefined}
			data-focus={isFocused ? "" : undefined}
			class={cx(context.styles.trigger, classProp)}
			{...rest}
		>
			{children}
		</button>
	);
}

export interface ContentProps extends PropsWithChildren {
	value: string;
	class?: string;
	[key: string]: unknown;
}

export function Content(props: ContentProps) {
	const { children, value, class: classProp, ...rest } = props;
	const context = useTabsContext();

	const isSelected = context.value === value;
	const triggerId = `${context.rootId}-trigger-${value}`;
	const contentId = `${context.rootId}-content-${value}`;

	const hasBeenSelected = context.mountedValues
		? context.mountedValues.includes(value)
		: isSelected;

	const shouldRender = context.unmountOnExit
		? isSelected
		: isSelected || !context.lazyMount || hasBeenSelected;

	if (!shouldRender) {
		return null;
	}

	return (
		<div
			id={contentId}
			role="tabpanel"
			aria-labelledby={triggerId}
			tabIndex={isSelected ? 0 : -1}
			data-scope="tabs"
			data-part="content"
			data-value={value}
			data-state={isSelected ? "open" : "closed"}
			data-orientation={context.orientation}
			hidden={!isSelected}
			class={cx(context.styles.content, classProp)}
			style={{
				display: isSelected ? undefined : "none",
				...(rest.style as Record<string, unknown>),
			}}
			{...rest}
		>
			{children}
		</div>
	);
}

export interface IndicatorProps {
	class?: string;
	style?: unknown;
	[key: string]: unknown;
}

export function Indicator(props: IndicatorProps) {
	const { class: classProp, style, ...rest } = props;
	const context = useTabsContext();

	const dataMeasured =
		context.isMeasured !== undefined ? String(context.isMeasured) : undefined;

	return (
		<div
			data-scope="tabs"
			data-part="indicator"
			data-orientation={context.orientation}
			data-measured={dataMeasured}
			class={cx(context.styles.indicator, classProp)}
			style={style as Record<string, unknown>}
			{...rest}
		/>
	);
}

export function Context(props: { children: (context: unknown) => unknown }) {
	const context = useContext(TabsContext);
	return props.children(context);
}
