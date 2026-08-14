import { cx } from "design-system/css";
import {
	type ToggleGroupVariantProps,
	toggleGroup,
} from "design-system/recipes";
import {
	createContext,
	type PropsWithChildren,
	useContext,
	useId,
} from "hono/jsx";

type ToggleGroupStyles = ReturnType<typeof toggleGroup>;

interface ToggleGroupContextValue {
	styles: ToggleGroupStyles;
	value?: string[];
	onValueChange?: (value: string[]) => void;
	multiple?: boolean;
	disabled?: boolean;
	orientation: "horizontal" | "vertical";
}

const ToggleGroupContext = createContext<ToggleGroupContextValue | null>(null);

export const useToggleGroupContext = () => {
	const context = useContext(ToggleGroupContext);
	if (!context) {
		if (typeof window === "undefined") {
			return {
				styles: toggleGroup({}),
				value: [],
				orientation: "horizontal",
			} as ToggleGroupContextValue;
		}
		throw new Error(
			"useToggleGroupContext must be used within a ToggleGroup.Root",
		);
	}
	return context;
};

export interface RootProps extends ToggleGroupVariantProps, PropsWithChildren {
	value?: string[];
	defaultValue?: string[];
	onValueChange?: (value: string[]) => void;
	multiple?: boolean;
	disabled?: boolean;
	orientation?: "horizontal" | "vertical";
	id?: string;
	class?: string;
	rootRef?: any;
}

export function Root(props: RootProps) {
	const [variantProps, localProps] = toggleGroup.splitVariantProps(props);
	const {
		children,
		value,
		defaultValue,
		onValueChange,
		multiple,
		disabled,
		orientation = "horizontal",
		id: idProp,
		rootRef,
		...rest
	} = localProps;

	const styles = toggleGroup(variantProps);
	const fallbackId = useId();
	const id = idProp || fallbackId;

	const contextValue: ToggleGroupContextValue = {
		styles,
		value: value ?? defaultValue ?? [],
		onValueChange,
		multiple,
		disabled,
		orientation,
	};

	return (
		<ToggleGroupContext.Provider
			context={ToggleGroupContext}
			value={contextValue}
		>
			<div
				id={id}
				ref={rootRef}
				role="group"
				class={cx(styles.root, localProps.class)}
				data-scope="toggle-group"
				data-part="root"
				data-orientation={orientation}
				{...rest}
			>
				{children}
			</div>
		</ToggleGroupContext.Provider>
	);
}

export interface ItemProps extends PropsWithChildren {
	value: string;
	disabled?: boolean;
	class?: string;
}

export function Item(props: ItemProps) {
	const { value, disabled, children, class: classProp, ...rest } = props;
	const context = useToggleGroupContext();
	const isPressed = context.value?.includes(value);
	const isDisabled = disabled || context.disabled;

	return (
		<button
			type="button"
			role={context.multiple ? "checkbox" : "radio"}
			aria-pressed={context.multiple ? isPressed : undefined}
			aria-checked={!context.multiple ? isPressed : undefined}
			disabled={isDisabled}
			class={cx(context.styles.item, classProp)}
			data-scope="toggle-group"
			data-part="item"
			data-value={value}
			data-orientation={context.orientation}
			data-state={isPressed ? "on" : "off"}
			data-disabled={isDisabled ? "" : undefined}
			{...rest}
		>
			{children}
		</button>
	);
}

export interface ToggleGroupItem {
	value: string;
	label: string | JSX.Element;
	disabled?: boolean;
}

export interface ToggleGroupStructureProps {
	items: ToggleGroupItem[];
}

export const ToggleGroupStructure = (props: ToggleGroupStructureProps) => {
	const { items } = props;
	return (
		<>
			{items.map((item) => (
				<Item key={item.value} value={item.value} disabled={item.disabled}>
					{item.label}
				</Item>
			))}
		</>
	);
};
