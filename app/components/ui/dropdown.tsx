import { cx } from "design-system/css";
import { type DropdownVariantProps, dropdown } from "design-system/recipes";
import type { JSX } from "hono/jsx";
import { EllipsisIcon as EllipsisIconImport } from "../../icons/ellipsis";
import InteractiveDropdownRoot from "../../islands/dropdown";
import { Button, ButtonGroup } from "./button";
// Import primitive components from dropdown-primitive
import {
	DropdownCheckboxItem as CheckboxItem,
	DropdownContent as Content,
	DropdownContextTrigger as ContextTrigger,
	DropdownArrow,
	DropdownArrowTip,
	DropdownItem as Item,
	DropdownItemGroup as ItemGroup,
	DropdownItemGroupLabel as ItemGroupLabel,
	DropdownItemIndicator as ItemIndicator,
	DropdownItemText as ItemText,
	DropdownPositioner as Positioner,
	DropdownRadioItem as RadioItem,
	DropdownRadioItemGroup as RadioItemGroup,
	DropdownRoot as RootPrimitive,
	DropdownSeparator as Separator,
	DropdownTrigger as Trigger,
	DropdownTriggerItem as TriggerItem,
} from "./dropdown-primitive";
import { shouldHydrate } from "./island-utils";

// ============= API Types =============

type DropdownItemType =
	| "item"
	| "separator"
	| "checkbox"
	| "radio"
	| "radio-group"
	| "submenu"
	| "group";

interface BaseDropdownItem {
	type?: DropdownItemType;
	disabled?: boolean;
	class?: string;
}

interface DropdownItemItem extends BaseDropdownItem {
	type?: "item";
	label: string;
	value: string;
	icon?: JSX.Element;
	indicator?: JSX.Element;
	/** Renders the item as a link (`asChild` onto an `<a>`) instead of a
	 * plain select-on-click menu item — e.g. a language switcher entry. */
	href?: string;
	/** Raw `onclick` attribute string, same literal-JS convention as the
	 * `button` block's `onclick` — runs without depending on `onSelect`,
	 * which can't be expressed in CMS JSON. */
	onclick?: string;
	/** Whether selecting this item closes the menu. Default `true`. */
	closeOnSelect?: boolean;
}

interface DropdownSeparatorItem extends BaseDropdownItem {
	type: "separator";
}

interface DropdownCheckboxItem extends BaseDropdownItem {
	type: "checkbox";
	label: string;
	value: string;
	checked?: boolean;
	icon?: JSX.Element;
}

interface DropdownRadioItem extends BaseDropdownItem {
	type: "radio";
	label: string;
	value: string;
	checked?: boolean;
	icon?: JSX.Element;
}

interface DropdownRadioGroupItem extends BaseDropdownItem {
	type: "radio-group";
	value: string;
	label?: string;
	items: DropdownRadioItem[];
}

interface DropdownSubmenuItem extends BaseDropdownItem {
	type: "submenu";
	label: string;
	icon?: JSX.Element;
	items: DropdownItem[];
}

interface DropdownGroupItem extends BaseDropdownItem {
	type: "group";
	label?: string;
	items: DropdownItem[];
}

type DropdownItem =
	| DropdownItemItem
	| DropdownSeparatorItem
	| DropdownCheckboxItem
	| DropdownRadioItem
	| DropdownRadioGroupItem
	| DropdownSubmenuItem
	| DropdownGroupItem;

interface DropdownProps extends DropdownVariantProps {
	trigger?: JSX.Element;
	items?: DropdownItem[];
	defaultOpen?: boolean;
	/** Whether the dropdown menu is currently open (controlled). */
	open?: boolean;
	/** Disables every trigger mode and renders the trigger as inert. Default `false`. */
	disabled?: boolean;
	interactive?: boolean;
	class?: string;
	contentClass?: string;
	positionerClass?: string;
	children?: any;
	arrow?: boolean | { pointAtCenter?: boolean };
	/**
	 * Placement of the menu relative to the trigger. Accepts the 12-way names
	 * (`"bottomLeft"`, `"topRight"`, ...) or their dash-case equivalents
	 * (`"bottom-start"`, `"top-end"`, ...). Default `"bottomLeft"`.
	 */
	placement?: string;
	triggerMode?:
		| ("click" | "hover" | "contextDropdown" | "contextMenu")[]
		| "click"
		| "hover"
		| "contextDropdown"
		| "contextMenu";
	mouseEnterDelay?: number;
	mouseLeaveDelay?: number;
	/** Close when Escape is pressed. Default `true`. */
	closeOnEscape?: boolean;
	/** Whether selecting a regular item closes the menu by default; an
	 * individual item's own `closeOnSelect` overrides this. Default `true`. */
	closeOnSelect?: boolean;
	/** Called when the menu opens or closes. */
	onOpenChange?: (open: boolean, info?: { source: "trigger" | "menu" }) => void;
	/** Called with an item's `value` when it is activated. */
	onSelect?: (value: string) => void;
	destroyOnHidden?: boolean;
	destroyPopupOnHide?: boolean;
	popupRender?: (menu: JSX.Element) => JSX.Element;
	dropdownRender?: (menu: JSX.Element) => JSX.Element;
	classNames?: {
		root?: string;
		item?: string;
		content?: string;
		positioner?: string;
		arrow?: string;
		arrowTip?: string;
		trigger?: string;
	};
	styles?: {
		root?: any;
		item?: any;
		content?: any;
		positioner?: any;
		arrow?: any;
		arrowTip?: any;
		trigger?: any;
	};
}

// ============= Rendering Functions =============

function renderDropdownItem(
	item: DropdownItem,
	index: number,
	size?: DropdownVariantProps["size"],
	interactive = true,
	onSelect?: (value: string) => void,
): JSX.Element {
	switch (item.type) {
		case "separator":
			return <Separator key={index} />;

		case "checkbox": {
			const checkboxItem = item as DropdownCheckboxItem;
			return (
				<CheckboxItem
					key={checkboxItem.value}
					value={checkboxItem.value}
					checked={checkboxItem.checked}
					disabled={checkboxItem.disabled}
					class={checkboxItem.class}
				>
					{checkboxItem.icon ? (
						<ItemIndicator>{checkboxItem.icon}</ItemIndicator>
					) : (
						<ItemIndicator />
					)}
					<ItemText>{checkboxItem.label}</ItemText>
				</CheckboxItem>
			);
		}

		case "radio": {
			const radioItem = item as DropdownRadioItem;
			return (
				<RadioItem
					key={radioItem.value}
					value={radioItem.value}
					checked={radioItem.checked}
					disabled={radioItem.disabled}
					class={radioItem.class}
				>
					{radioItem.icon ? (
						<ItemIndicator>{radioItem.icon}</ItemIndicator>
					) : (
						<ItemIndicator />
					)}
					<ItemText>{radioItem.label}</ItemText>
				</RadioItem>
			);
		}

		case "radio-group": {
			const radioGroup = item as DropdownRadioGroupItem;
			return (
				<RadioItemGroup key={radioGroup.value} value={radioGroup.value}>
					{radioGroup.label && (
						<ItemGroupLabel>{radioGroup.label}</ItemGroupLabel>
					)}
					{radioGroup.items.map((radioItem, idx) =>
						renderDropdownItem(radioItem, idx, size, interactive, onSelect),
					)}
				</RadioItemGroup>
			);
		}

		case "group": {
			const groupItem = item as DropdownGroupItem;
			return (
				<ItemGroup key={index} class={groupItem.class}>
					{groupItem.label && (
						<ItemGroupLabel>{groupItem.label}</ItemGroupLabel>
					)}
					{groupItem.items.map((child, idx) =>
						renderDropdownItem(child, idx, size, interactive, onSelect),
					)}
				</ItemGroup>
			);
		}

		case "submenu": {
			const submenuItem = item as DropdownSubmenuItem;
			return (
				<DropdownSubmenu
					key={submenuItem.label}
					item={submenuItem}
					size={size}
					interactive={interactive}
					onSelect={onSelect}
				/>
			);
		}

		default: {
			const menuItem = item as DropdownItemItem;
			const content = (
				<>
					{menuItem.icon && <ItemIndicator>{menuItem.icon}</ItemIndicator>}
					<ItemText>{menuItem.label}</ItemText>
					{menuItem.indicator}
				</>
			);
			if (menuItem.href) {
				return (
					<Item
						key={menuItem.value}
						value={menuItem.value}
						disabled={menuItem.disabled}
						class={menuItem.class}
						closeOnSelect={menuItem.closeOnSelect}
						asChild
					>
						<a href={menuItem.href}>{content}</a>
					</Item>
				);
			}
			return (
				<Item
					key={menuItem.value}
					value={menuItem.value}
					disabled={menuItem.disabled}
					class={menuItem.class}
					onclick={menuItem.onclick}
					closeOnSelect={menuItem.closeOnSelect}
				>
					{content}
				</Item>
			);
		}
	}
}

/**
 * A cascading submenu, nested inside a parent menu's content. When the parent
 * hydrates, this is its own `InteractiveDropdownRoot` instance — opened via
 * hover or click on its `TriggerItem`, positioned beside it (see `submenu` on
 * `InteractiveDropdownRootProps` for why it needs its own island). Otherwise
 * it renders the same static, inert structure as the top-level non-hydrated
 * case, just closed (submenus have no way to open without JS).
 */
function DropdownSubmenu({
	item,
	size,
	interactive,
	onSelect,
}: {
	item: DropdownSubmenuItem;
	size?: DropdownVariantProps["size"];
	interactive: boolean;
	onSelect?: (value: string) => void;
}) {
	const styles = dropdown({ size });
	const triggerItem = (
		<TriggerItem disabled={item.disabled}>
			{item.icon && <ItemIndicator>{item.icon}</ItemIndicator>}
			<ItemText>{item.label}</ItemText>
		</TriggerItem>
	);
	const positioner = (
		<Positioner placement="rightTop" class={styles.positioner}>
			<Content class={styles.content}>
				{item.items.map((child, idx) =>
					renderDropdownItem(child, idx, size, interactive, onSelect),
				)}
			</Content>
		</Positioner>
	);

	if (interactive) {
		return (
			<InteractiveDropdownRoot
				submenu
				trigger={["hover", "click"]}
				placement="rightTop"
				disabled={item.disabled}
				onSelect={onSelect}
			>
				{triggerItem}
				{positioner}
			</InteractiveDropdownRoot>
		);
	}

	return (
		<RootPrimitive open={false} disabled={item.disabled}>
			{triggerItem}
			{positioner}
		</RootPrimitive>
	);
}

// ============= Dropdown Component =============

function DropdownRoot(props: DropdownProps) {
	const {
		trigger: triggerProp,
		items,
		defaultOpen = false,
		open,
		disabled,
		interactive,
		class: classProp,
		contentClass,
		positionerClass,
		children,
		arrow,
		placement = "bottomLeft",
		triggerMode,
		mouseEnterDelay,
		mouseLeaveDelay,
		closeOnEscape,
		closeOnSelect,
		onOpenChange,
		onSelect,
		destroyOnHidden,
		destroyPopupOnHide,
		popupRender,
		dropdownRender,
		classNames,
		styles: stylesProp,
		...variantProps
	} = props;

	const styles = dropdown(variantProps);
	// Handle 'trigger' as trigger modes
	const trigger =
		props.trigger && !("type" in props.trigger && props.trigger.type)
			? undefined
			: props.trigger;
	const triggerPropForMode =
		props.trigger && !("type" in props.trigger && props.trigger.type)
			? props.trigger
			: undefined;

	const triggerModeVal = triggerPropForMode ?? triggerMode ?? ["click"];
	const triggerModes = Array.isArray(triggerModeVal)
		? triggerModeVal
		: [triggerModeVal];

	const isContextMenuOnly =
		triggerModes.includes("contextDropdown") &&
		!triggerModes.includes("click") &&
		!triggerModes.includes("hover");
	const TriggerComponent = isContextMenuOnly ? ContextTrigger : Trigger;

	const isArrowVisible = !!arrow;

	if (shouldHydrate(interactive, true)) {
		const menuContent = items ? (
			<Content class={cx(styles.content, contentClass)}>
				{items.map((item, index) =>
					renderDropdownItem(item, index, variantProps.size, true, onSelect),
				)}
			</Content>
		) : null;

		const customPopup = menuContent
			? popupRender
				? popupRender(menuContent)
				: dropdownRender
					? dropdownRender(menuContent)
					: menuContent
			: null;

		return (
			<InteractiveDropdownRoot
				open={open}
				defaultOpen={defaultOpen}
				disabled={disabled}
				placement={placement}
				trigger={triggerModeVal as any}
				mouseEnterDelay={mouseEnterDelay}
				mouseLeaveDelay={mouseLeaveDelay}
				closeOnEscape={closeOnEscape}
				closeOnSelect={closeOnSelect}
				onOpenChange={onOpenChange}
				onSelect={onSelect}
				arrow={arrow}
				destroyOnHidden={destroyOnHidden ?? destroyPopupOnHide}
				classNames={classNames}
				styles={stylesProp}
			>
				{trigger && <TriggerComponent asChild>{trigger}</TriggerComponent>}
				{children}
				{customPopup && (
					<Positioner
						placement={placement}
						class={cx(styles.positioner, positionerClass)}
					>
						{isArrowVisible && (
							<DropdownArrow placement={placement}>
								<DropdownArrowTip placement={placement} />
							</DropdownArrow>
						)}
						{customPopup}
					</Positioner>
				)}
			</InteractiveDropdownRoot>
		);
	}

	const menuContent = items ? (
		<Content class={cx(styles.content, contentClass)}>
			{items.map((item, index) =>
				renderDropdownItem(item, index, variantProps.size, false, onSelect),
			)}
		</Content>
	) : null;

	const customPopup = menuContent
		? popupRender
			? popupRender(menuContent)
			: dropdownRender
				? dropdownRender(menuContent)
				: menuContent
		: null;

	return (
		<RootPrimitive
			open={open ?? defaultOpen}
			disabled={disabled}
			destroyOnHidden={destroyOnHidden ?? destroyPopupOnHide}
			classNames={classNames}
			stylesObj={stylesProp}
		>
			{trigger && <TriggerComponent asChild>{trigger}</TriggerComponent>}
			{children}
			{customPopup && (
				<Positioner
					placement={placement}
					class={cx(styles.positioner, positionerClass)}
				>
					{isArrowVisible && (
						<DropdownArrow placement={placement}>
							<DropdownArrowTip placement={placement} />
						</DropdownArrow>
					)}
					{customPopup}
				</Positioner>
			)}
		</RootPrimitive>
	);
}

// ============= DropdownButton Component =============

const EllipsisIcon = () => (
	<EllipsisIconImport width="16" height="16" aria-hidden="true" />
);

export interface DropdownButtonProps extends DropdownProps {
	type?:
		| "default"
		| "primary"
		| "dashed"
		| "link"
		| "text"
		| "solid"
		| "outline"
		| "subtle"
		| "plain"
		| "surface";
	danger?: boolean;
	disabled?: boolean;
	loading?: boolean;
	onClick?: (e: MouseEvent) => void;
	icon?: JSX.Element;
	buttonsRender?: (buttons: JSX.Element[]) => JSX.Element[];
}

export function DropdownButton(props: DropdownButtonProps) {
	const {
		type = "outline",
		danger,
		disabled,
		loading,
		onClick,
		icon = <EllipsisIcon />,
		children,
		buttonsRender,
		items,
		open,
		defaultOpen,
		onOpenChange,
		onSelect,
		placement,
		trigger: triggerProp,
		triggerMode,
		arrow,
		classNames,
		styles,
		destroyOnHidden,
		...rest
	} = props;

	const colorPalette = danger ? "red" : "gray";
	let variant = type;
	if (type === "primary") variant = "solid";
	if (type === "default") variant = "outline";
	if (type === "text" || type === "link") variant = "plain";

	const leftButton = (
		<Button
			key="left"
			variant={variant as any}
			colorPalette={colorPalette}
			disabled={disabled}
			loading={loading}
			onClick={onClick}
		>
			{children}
		</Button>
	);

	const rightButton = (
		<Button
			key="right"
			variant={variant as any}
			colorPalette={colorPalette}
			disabled={disabled}
		>
			{icon}
		</Button>
	);

	const [btn1, btn2] = buttonsRender
		? buttonsRender([leftButton, rightButton])
		: [leftButton, rightButton];

	return (
		<ButtonGroup attached>
			{btn1}
			<Dropdown
				interactive={true}
				items={items}
				open={open}
				defaultOpen={defaultOpen}
				onOpenChange={onOpenChange}
				onSelect={onSelect}
				placement={placement}
				triggerMode={triggerProp ?? triggerMode ?? "click"}
				arrow={arrow}
				classNames={classNames}
				styles={styles}
				destroyOnHidden={destroyOnHidden}
				trigger={btn2}
			/>
		</ButtonGroup>
	);
}

// ============= Exports =============

export const Dropdown = Object.assign(DropdownRoot, {
	Root: DropdownRoot,
	Trigger: Trigger,
	TriggerItem: TriggerItem,
	Positioner: Positioner,
	Content: Content,
	Item: Item,
	CheckboxItem: CheckboxItem,
	Separator: Separator,
	ItemText: ItemText,
	ItemIndicator: ItemIndicator,
	ItemGroup: ItemGroup,
	ItemGroupLabel: ItemGroupLabel,
	RadioItemGroup: RadioItemGroup,
	Arrow: DropdownArrow,
	ArrowTip: DropdownArrowTip,
	Button: DropdownButton,
});

export {
	type BaseDropdownItem,
	Dropdown as default,
	type DropdownCheckboxItem,
	type DropdownGroupItem,
	type DropdownItem,
	type DropdownItemItem,
	type DropdownItemType,
	type DropdownProps,
	type DropdownRadioGroupItem,
	type DropdownRadioItem,
	type DropdownSeparatorItem,
	type DropdownSubmenuItem,
};
