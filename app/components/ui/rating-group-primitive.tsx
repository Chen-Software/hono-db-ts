import { cx } from "design-system/css";
import type { RatingGroupVariantProps } from "design-system/recipes";
import { ratingGroup } from "design-system/recipes";
import {
	createContext,
	type JSX,
	type PropsWithChildren,
	useContext,
	useId,
} from "hono/jsx";
import type { ColorPalette } from "./color-palette";
import { colorPaletteClass } from "./color-palette";

type RatingGroupStyles = ReturnType<typeof ratingGroup>;

interface RatingGroupContextValue {
	styles: RatingGroupStyles;
	value: number;
	count: number;
	allowHalf: boolean;
	iconPath: string;
	id: string;
	name?: string;
	disabled?: boolean;
	readOnly?: boolean;
}

const RatingGroupContext = createContext<RatingGroupContextValue | null>(null);

const defaultStarPath =
	"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z";

const useRatingGroupContext = () => {
	const context = useContext(RatingGroupContext);
	if (!context) {
		if (typeof window === "undefined") {
			return {
				id: "ssr-rating-group",
				styles: ratingGroup({}),
				value: 0,
				count: 5,
				allowHalf: false,
				iconPath: defaultStarPath,
			} as RatingGroupContextValue;
		}
		throw new Error(
			"useRatingGroupContext must be used within a RatingGroup.Root",
		);
	}
	return context;
};

export interface RootProps extends RatingGroupVariantProps, PropsWithChildren {
	colorPalette?: ColorPalette;
	value?: number;
	defaultValue?: number;
	count?: number;
	allowHalf?: boolean;
	disabled?: boolean;
	readOnly?: boolean;
	invalid?: boolean;
	required?: boolean;
	name?: string;
	form?: string;
	dir?: "ltr" | "rtl";
	id?: string;
	class?: string;
	label?: string | JSX.Element;
	/** Custom SVG `d` path used for every item icon (defaults to a star). */
	icon?: string;
	/** No-op in the static (non-hydrated) render; consumed by the island. */
	onValueChange?: (details: { value: number }) => void;
	/** No-op in the static (non-hydrated) render; consumed by the island. */
	onHoveredValueChange?: (details: { hoveredValue: number | null }) => void;
}

function clampValue(value: number, count: number) {
	return Math.max(0, Math.min(count, value));
}

function itemState(context: RatingGroupContextValue, index: number) {
	const { value } = context;
	const floorValue = Math.floor(value);
	const hasHalf = context.allowHalf && value - floorValue >= 0.5;
	const half = hasHalf && index === floorValue + 1;
	const highlighted = index <= floorValue || half;
	const checked = value > 0 && index === Math.ceil(value);
	return { checked, highlighted, half };
}

function Root(props: RootProps) {
	const [variantProps, localProps] = ratingGroup.splitVariantProps(props);
	const {
		children,
		value: valueProp,
		defaultValue,
		count = 5,
		allowHalf = false,
		disabled,
		readOnly,
		invalid,
		required,
		name,
		form,
		dir,
		id: idProp,
		class: className,
		colorPalette = "amber",
		label,
		icon,
		onValueChange: _onValueChange,
		onHoveredValueChange: _onHoveredValueChange,
		...rest
	} = localProps;

	const styles = ratingGroup(variantProps);
	const fallbackId = useId();
	const id = idProp || fallbackId;
	const value = clampValue(valueProp ?? defaultValue ?? 0, count);

	const contextValue: RatingGroupContextValue = {
		styles,
		value,
		count,
		allowHalf,
		iconPath: icon || defaultStarPath,
		id,
		name,
		disabled,
		readOnly,
	};

	return (
		<RatingGroupContext.Provider value={contextValue}>
			<div
				id={id}
				dir={dir}
				class={cx(
					styles.root,
					colorPaletteClass(colorPalette as string | undefined),
					className,
				)}
				data-disabled={disabled ? "" : undefined}
				data-readonly={readOnly ? "" : undefined}
				data-invalid={invalid ? "" : undefined}
				data-scope="rating-group"
				data-part="root"
				{...rest}
			>
				{children ?? (
					<>
						{label && <Label>{label}</Label>}
						<Control>
							{Array.from({ length: count }, (_, i) => i + 1).map((index) => (
								<Item key={index} index={index}>
									<ItemIndicator />
								</Item>
							))}
						</Control>
					</>
				)}
				<input
					type="hidden"
					name={name}
					form={form}
					value={value}
					disabled={disabled}
					required={required}
				/>
			</div>
		</RatingGroupContext.Provider>
	);
}

interface LabelProps extends PropsWithChildren {
	class?: string;
}

function Label(props: LabelProps) {
	const context = useRatingGroupContext();
	return (
		<span
			class={cx(context.styles.label, props.class)}
			data-scope="rating-group"
			data-part="label"
			data-disabled={context.disabled ? "" : undefined}
		>
			{props.children}
		</span>
	);
}

interface ControlProps extends PropsWithChildren {
	class?: string;
}

function Control(props: ControlProps) {
	const context = useRatingGroupContext();
	return (
		<div
			class={cx(context.styles.control, props.class)}
			role="radiogroup"
			aria-disabled={context.disabled ? "true" : undefined}
			aria-readonly={context.readOnly ? "true" : undefined}
			data-scope="rating-group"
			data-part="control"
		>
			{props.children}
		</div>
	);
}

const ItemContext = createContext<{ index: number } | null>(null);

interface ItemProps extends PropsWithChildren {
	index: number;
	class?: string;
}

function Item(props: ItemProps) {
	const { index, children, class: className, ...rest } = props;
	const context = useRatingGroupContext();
	const { checked, highlighted, half } = itemState(context, index);
	const activeIndex = context.value > 0 ? Math.ceil(context.value) : 1;
	const isDisabled = context.disabled;

	return (
		<ItemContext.Provider value={{ index }}>
			<div
				role="radio"
				aria-checked={checked}
				aria-posinset={index}
				aria-setsize={context.count}
				aria-disabled={isDisabled ? "true" : undefined}
				data-scope="rating-group"
				data-part="item"
				data-index={index}
				data-state={checked ? "checked" : "unchecked"}
				data-highlighted={highlighted ? "" : undefined}
				data-half={half ? "" : undefined}
				data-disabled={isDisabled ? "" : undefined}
				data-readonly={context.readOnly ? "" : undefined}
				tabIndex={!isDisabled && index === activeIndex ? 0 : -1}
				class={cx(context.styles.item, className)}
				{...rest}
			>
				{children}
			</div>
		</ItemContext.Provider>
	);
}

function ItemIndicatorIcon(props: { part: "bg" | "fg"; path: string }) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="currentColor"
			data-part="icon"
			data-bg={props.part === "bg" ? "" : undefined}
			data-fg={props.part === "fg" ? "" : undefined}
			aria-hidden="true"
		>
			<path d={props.path} />
		</svg>
	);
}

interface ItemIndicatorProps {
	class?: string;
}

function ItemIndicator(props: ItemIndicatorProps) {
	const context = useRatingGroupContext();
	const item = useContext(ItemContext);
	const index = item?.index ?? 0;
	const { highlighted, half } = itemState(context, index);

	return (
		<div
			class={cx(context.styles.itemIndicator, props.class)}
			data-scope="rating-group"
			data-part="item-indicator"
			data-highlighted={highlighted ? "" : undefined}
			data-half={half ? "" : undefined}
		>
			<ItemIndicatorIcon part="bg" path={context.iconPath} />
			<ItemIndicatorIcon part="fg" path={context.iconPath} />
		</div>
	);
}

export type { ControlProps, ItemIndicatorProps, ItemProps, LabelProps };
export {
	Control,
	clampValue,
	Item,
	ItemIndicator,
	itemState,
	Label,
	Root,
	useRatingGroupContext,
};
