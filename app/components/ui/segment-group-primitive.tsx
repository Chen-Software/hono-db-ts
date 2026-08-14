import { cx } from "design-system/css";
import {
	type SegmentGroupVariantProps,
	segmentGroup,
} from "design-system/recipes";
import type { JSX } from "hono/jsx";
import {
	createContext,
	type PropsWithChildren,
	useContext,
	useId,
} from "hono/jsx";

type SegmentGroupStyles = ReturnType<typeof segmentGroup>;

interface SegmentGroupContextValue {
	styles: SegmentGroupStyles;
	value?: string;
	onValueChange?: (value: string) => void;
	id: string;
	name?: string;
	orientation: "horizontal" | "vertical";
	disabled?: boolean;
}

const SegmentGroupContext = createContext<SegmentGroupContextValue | null>(
	null,
);

export const useSegmentGroupContext = () => {
	const context = useContext(SegmentGroupContext);
	if (!context) {
		if (typeof window === "undefined") {
			return {
				id: "ssr-segment-group",
				styles: segmentGroup({}),
				orientation: "horizontal",
			} as SegmentGroupContextValue;
		}
		throw new Error(
			"useSegmentGroupContext must be used within a SegmentGroup.Root",
		);
	}
	return context;
};

export interface RootProps extends SegmentGroupVariantProps, PropsWithChildren {
	defaultValue?: string;
	value?: string;
	onValueChange?: (value: string) => void;
	id?: string;
	orientation?: "horizontal" | "vertical";
	name?: string;
	disabled?: boolean;
	readOnly?: boolean;
	rootRef?: any;
	class?: string;
}

export function Root(props: RootProps) {
	const [variantProps, localProps] = segmentGroup.splitVariantProps(props);
	const {
		children,
		value,
		defaultValue,
		onValueChange,
		id: idProp,
		orientation = "horizontal",
		name,
		disabled,
		readOnly,
		rootRef,
		...rest
	} = localProps;

	const styles = segmentGroup(variantProps);
	const fallbackId = useId();
	const id = idProp || fallbackId;

	const contextValue: SegmentGroupContextValue = {
		styles,
		value: value ?? defaultValue,
		onValueChange,
		id,
		name,
		orientation,
		disabled,
	};

	return (
		<SegmentGroupContext.Provider value={contextValue}>
			<div
				id={id}
				ref={rootRef}
				role="radiogroup"
				class={cx(styles.root, localProps.class)}
				data-orientation={orientation}
				data-disabled={disabled ? "" : undefined}
				data-readonly={readOnly ? "" : undefined}
				data-scope="segment-group"
				data-part="root"
				{...rest}
			>
				{children}
			</div>
		</SegmentGroupContext.Provider>
	);
}

export interface LabelProps extends PropsWithChildren {
	class?: string;
}

export function Label(props: LabelProps) {
	const context = useSegmentGroupContext();
	return (
		<label
			class={cx(context.styles.label, props.class)}
			data-scope="segment-group"
			data-part="label"
		>
			{props.children}
		</label>
	);
}

export interface IndicatorProps {
	class?: string;
	style?: any;
}

export function Indicator(props: IndicatorProps) {
	const { class: classProp, style, ...rest } = props;
	const context = useSegmentGroupContext();
	return (
		<div
			data-scope="segment-group"
			data-part="indicator"
			data-orientation={context.orientation}
			class={cx(context.styles.indicator, classProp)}
			style={style}
			{...rest}
		/>
	);
}

export interface ItemProps extends PropsWithChildren {
	value: string;
	disabled?: boolean;
	invalid?: boolean;
	class?: string;
	/** Raw `onclick` attribute string, same literal-JS convention as the
	 * `button` block's `onclick` — for CMS-driven side effects (e.g. switching
	 * `data-theme`) that can't be expressed as an `onValueChange` JS callback
	 * in JSON. */
	onclick?: string;
}

const ItemContext = createContext<{ value: string; disabled?: boolean } | null>(
	null,
);

export function Item(props: ItemProps) {
	const { value, disabled, children, class: classProp, ...rest } = props;
	const context = useSegmentGroupContext();
	const isChecked = context.value === value;
	const isDisabled = disabled || context.disabled;

	return (
		<ItemContext.Provider value={{ value, disabled: isDisabled }}>
			<label
				class={cx(context.styles.item, classProp)}
				data-scope="segment-group"
				data-part="item"
				data-value={value}
				data-orientation={context.orientation}
				data-state={isChecked ? "checked" : "unchecked"}
				data-disabled={isDisabled ? "" : undefined}
				tabIndex={isChecked && !isDisabled ? 0 : -1}
				{...rest}
			>
				{children}
			</label>
		</ItemContext.Provider>
	);
}

export interface ItemTextProps extends PropsWithChildren {
	class?: string;
}

export function ItemText(props: ItemTextProps) {
	const context = useSegmentGroupContext();
	const item = useContext(ItemContext);
	const isChecked = context.value === item?.value;

	return (
		<span
			class={cx(context.styles.itemText, props.class)}
			data-scope="segment-group"
			data-part="item-text"
			data-state={isChecked ? "checked" : "unchecked"}
			data-disabled={item?.disabled ? "" : undefined}
		>
			{props.children}
		</span>
	);
}

export interface ItemControlProps extends PropsWithChildren {
	class?: string;
}

export function ItemControl(props: ItemControlProps) {
	const context = useSegmentGroupContext();
	const item = useContext(ItemContext);
	const isChecked = context.value === item?.value;

	return (
		<div
			class={cx(context.styles.itemControl, props.class)}
			data-scope="segment-group"
			data-part="item-control"
			data-state={isChecked ? "checked" : "unchecked"}
			data-disabled={item?.disabled ? "" : undefined}
		>
			{props.children}
		</div>
	);
}

export function ItemHiddenInput() {
	const context = useSegmentGroupContext();
	const item = useContext(ItemContext);
	const isChecked = context.value === item?.value;

	return (
		<input
			type="radio"
			aria-hidden="true"
			tabIndex={-1}
			checked={isChecked}
			disabled={item?.disabled}
			name={context.name || context.id}
			value={item?.value}
			style={{
				border: "0px",
				clip: "rect(0px, 0px, 0px, 0px)",
				height: "1px",
				margin: "-1px",
				overflow: "hidden",
				padding: "0px",
				position: "absolute",
				width: "1px",
				whiteSpace: "nowrap",
				wordWrap: "normal",
			}}
		/>
	);
}

export interface SegmentGroupItem {
	value: string;
	label: string | JSX.Element;
	disabled?: boolean;
	invalid?: boolean;
	/** See `ItemProps.onclick`. */
	onclick?: string;
}

export interface SegmentGroupStructureProps {
	items: (string | SegmentGroupItem)[];
}

export const SegmentGroupStructure = (props: SegmentGroupStructureProps) => {
	const { items } = props;

	return (
		<>
			<Indicator />
			{items.map((item) => {
				const normalisedItem =
					typeof item === "string" ? { value: item, label: item } : item;
				return (
					<Item
						key={normalisedItem.value}
						value={normalisedItem.value}
						disabled={normalisedItem.disabled}
						invalid={normalisedItem.invalid}
						onclick={normalisedItem.onclick}
					>
						<ItemText>{normalisedItem.label}</ItemText>
						<ItemHiddenInput />
					</Item>
				);
			})}
		</>
	);
};
