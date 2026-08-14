import { cx } from "design-system/css";
import type { ComboboxVariantProps } from "design-system/recipes";
import { combobox } from "design-system/recipes";
import type { Child } from "hono/jsx";
import {
	createContext,
	type PropsWithChildren,
	useContext,
	useEffect,
	useId,
	useRef,
	useState,
} from "hono/jsx";
import { CheckIcon } from "../../icons/check";
import { ChevronsUpDownIcon } from "../../icons/chevrons-up-down";
import { CloseIcon } from "../../icons/close";
import { useOverlayStackEntry } from "./overlay-a11y";

type ComboboxStyles = ReturnType<typeof combobox>;

export interface ComboboxContextValue {
	styles: ComboboxStyles;
	open: boolean;
	inputValue: string;
	searchQuery?: string;
	selectedValue?: string | string[];
	highlightedIndex: number;
	items: ComboboxItem[];
	rootId: string;
	disabled?: boolean;
	invalid?: boolean;
	readOnly?: boolean;
	required?: boolean;
	multiple?: boolean;
	errorText?: Child;
	onToggle?: () => void;
	onClose?: () => void;
	onInputChange?: (value: string) => void;
	onItemSelect?: (value: string) => void;
	setHighlightedIndex?: (index: number) => void;
}

const ComboboxContext = createContext<ComboboxContextValue | null>(null);

export const useComboboxContext = () => {
	const context = useContext(ComboboxContext);
	return context;
};

export const ItemContext = createContext<{
	value: string;
	disabled?: boolean;
} | null>(null);

export const useComboboxItemContext = () => useContext(ItemContext);

export interface ComboboxItem {
	label: string;
	value: string;
	disabled?: boolean;
}

export interface RootProps extends ComboboxVariantProps, PropsWithChildren {
	open?: boolean;
	inputValue?: string;
	searchQuery?: string;
	selectedValue?: string | string[];
	highlightedIndex?: number;
	items?: ComboboxItem[];
	disabled?: boolean;
	invalid?: boolean;
	readOnly?: boolean;
	required?: boolean;
	multiple?: boolean;
	errorText?: Child;
	onToggle?: () => void;
	onClose?: () => void;
	onInputChange?: (value: string) => void;
	onItemSelect?: (value: string) => void;
	setHighlightedIndex?: (index: number) => void;
	class?: string;
	id?: string;
	style?: any;
	[key: string]: any;
}

export function Root(props: RootProps) {
	const [variantProps, localProps] = combobox.splitVariantProps(props);
	const {
		children,
		open = false,
		inputValue = "",
		searchQuery,
		selectedValue,
		highlightedIndex = -1,
		items = [],
		disabled,
		invalid,
		readOnly,
		required,
		multiple,
		errorText,
		onToggle,
		onClose,
		onInputChange,
		onItemSelect,
		setHighlightedIndex,
		class: classProp,
		style,
		id,
		...rest
	} = localProps;

	// Flattened-API-only props must not leak onto the DOM as attributes.
	const {
		label: _label,
		placeholder: _placeholder,
		allowClear: _allowClear,
		closeOnSelect: _closeOnSelect,
		helperText: _helperText,
		onValueChange: _onValueChange,
		multiple: _multipleLeak,
		...domProps
	} = rest;

	const styles = combobox(variantProps);
	const rootId = id || "combobox";

	return (
		<ComboboxContext.Provider
			value={{
				styles,
				open,
				inputValue,
				searchQuery,
				selectedValue,
				highlightedIndex,
				items,
				rootId,
				disabled,
				invalid,
				readOnly,
				required,
				multiple,
				errorText,
				onToggle,
				onClose,
				onInputChange,
				onItemSelect,
				setHighlightedIndex,
			}}
		>
			<div
				id={rootId}
				data-scope="combobox"
				data-part="root"
				data-overlay-root
				class={cx(styles.root, classProp)}
				style={{ position: "relative", ...style }}
				{...domProps}
			>
				{children}
			</div>
		</ComboboxContext.Provider>
	);
}

export function RootProvider(props: RootProps) {
	return <Root {...props} />;
}

export function RequiredIndicator(props: { children?: Child; class?: string }) {
	const context = useComboboxContext();
	return (
		<span
			aria-hidden="true"
			class={cx(context?.styles.requiredIndicator, props.class)}
			data-disabled={context?.disabled ? "" : undefined}
			data-invalid={context?.invalid ? "" : undefined}
			data-readonly={context?.readOnly ? "" : undefined}
			data-required={context?.required ? "" : undefined}
		>
			{props.children || "*"}
		</span>
	);
}

export function HelperText(props: { children?: Child; class?: string }) {
	const context = useComboboxContext();
	return (
		<div
			id={context?.rootId ? `${context.rootId}-helper-text` : undefined}
			class={cx(context?.styles.helperText, props.class)}
			data-disabled={context?.disabled ? "" : undefined}
			data-invalid={context?.invalid ? "" : undefined}
			data-readonly={context?.readOnly ? "" : undefined}
			data-required={context?.required ? "" : undefined}
		>
			{props.children}
		</div>
	);
}

export function ErrorText(props: { children?: Child; class?: string }) {
	const context = useComboboxContext();
	const content = props.children || context?.errorText;
	if (context?.invalid && content) {
		return (
			<div
				id={context?.rootId ? `${context.rootId}-error-text` : undefined}
				aria-live="polite"
				class={cx(context?.styles.errorText, props.class)}
				data-disabled={context?.disabled ? "" : undefined}
				data-invalid={context?.invalid ? "" : undefined}
				data-readonly={context?.readOnly ? "" : undefined}
				data-required={context?.required ? "" : undefined}
			>
				{content}
			</div>
		);
	}
	return null;
}

export function Label(
	props: PropsWithChildren<{ class?: string; htmlFor?: string }>,
) {
	const { children, class: classProp, htmlFor, ...rest } = props;
	const context = useComboboxContext();
	return (
		<label
			htmlFor={
				htmlFor || (context?.rootId ? `${context.rootId}-input` : undefined)
			}
			data-scope="combobox"
			data-part="label"
			data-disabled={context?.disabled ? "" : undefined}
			data-invalid={context?.invalid ? "" : undefined}
			data-readonly={context?.readOnly ? "" : undefined}
			data-required={context?.required ? "" : undefined}
			class={cx(context?.styles.label, classProp)}
			{...rest}
		>
			{children}
			{context?.required && <RequiredIndicator />}
		</label>
	);
}

export function Control(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useComboboxContext();
	return (
		<div
			data-scope="combobox"
			data-part="control"
			data-state={context?.open ? "open" : "closed"}
			data-disabled={context?.disabled ? "" : undefined}
			data-invalid={context?.invalid ? "" : undefined}
			class={cx(context?.styles.control, classProp)}
			{...rest}
		>
			{children}
		</div>
	);
}

export function Input(props: any) {
	const { class: classProp, id, ...rest } = props;
	const context = useComboboxContext();
	return (
		<input
			id={id || (context?.rootId ? `${context.rootId}-input` : undefined)}
			role="combobox"
			aria-autocomplete="list"
			aria-expanded={context?.open}
			aria-haspopup="listbox"
			data-scope="combobox"
			data-part="input"
			data-state={context?.open ? "open" : "closed"}
			data-disabled={context?.disabled ? "" : undefined}
			data-invalid={context?.invalid ? "" : undefined}
			data-readonly={context?.readOnly ? "" : undefined}
			aria-readonly={context?.readOnly}
			disabled={context?.disabled}
			required={context?.required}
			class={cx(context?.styles.input, classProp)}
			value={context?.inputValue}
			onInput={(e: Event) => {
				const value = (e.target as HTMLInputElement).value;
				context?.onInputChange?.(value);
			}}
			{...rest}
		/>
	);
}

export function Trigger(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useComboboxContext();
	return (
		<button
			type="button"
			aria-label="open"
			aria-haspopup="listbox"
			aria-expanded={context?.open}
			data-scope="combobox"
			data-part="trigger"
			data-state={context?.open ? "open" : "closed"}
			data-disabled={context?.disabled ? "" : undefined}
			data-invalid={context?.invalid ? "" : undefined}
			data-readonly={context?.readOnly ? "" : undefined}
			disabled={context?.disabled}
			class={cx(context?.styles.trigger, classProp)}
			{...rest}
		>
			{children || <ChevronsUpDownIcon width="16" height="16" />}
		</button>
	);
}

export function ClearTrigger(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useComboboxContext();
	return (
		<button
			type="button"
			aria-label="clear"
			data-scope="combobox"
			data-part="clear-trigger"
			data-disabled={context?.disabled ? "" : undefined}
			data-invalid={context?.invalid ? "" : undefined}
			disabled={context?.disabled}
			class={cx(context?.styles.clearTrigger, classProp)}
			{...rest}
		>
			{children || <CloseIcon width="16" height="16" />}
		</button>
	);
}

export function IndicatorGroup(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useComboboxContext();
	return (
		<div
			data-scope="combobox"
			data-part="indicator-group"
			class={cx(context?.styles.indicatorGroup, classProp)}
			{...rest}
		>
			{children}
		</div>
	);
}

export function Positioner(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useComboboxContext();
	return (
		<div
			data-scope="combobox"
			data-part="positioner"
			data-state={context?.open ? "open" : "closed"}
			class={cx(context?.styles.positioner, classProp)}
			style={{
				position: "absolute",
				top: "100%",
				left: "0",
				width: "100%",
				zIndex: 1000,
				display: context?.open ? "block" : "none",
			}}
			{...rest}
		>
			{children}
		</div>
	);
}

export function Content(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useComboboxContext();
	return (
		<div
			data-scope="combobox"
			data-part="content"
			data-state={context?.open ? "open" : "closed"}
			class={cx(context?.styles.content, classProp)}
			style={{
				display: context?.open ? "flex" : "none",
				flexDirection: "column",
			}}
			{...rest}
		>
			{children}
		</div>
	);
}

export function List(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useComboboxContext();
	return (
		<div
			role="listbox"
			data-scope="combobox"
			data-part="list"
			class={cx(context?.styles.list, classProp)}
			{...rest}
		>
			{children}
		</div>
	);
}

export function Item(
	props: PropsWithChildren<{
		value: string;
		itemValue?: string;
		disabled?: boolean;
		index?: number;
		class?: string;
		[key: string]: any;
	}>,
) {
	const {
		children,
		value,
		itemValue,
		disabled,
		index,
		class: classProp,
		...rest
	} = props;
	const context = useComboboxContext();
	const isHighlighted = context?.highlightedIndex === index;
	const currentItemValue = itemValue ?? value;
	const isSelected =
		context?.selectedValue !== undefined
			? Array.isArray(context.selectedValue)
				? context.selectedValue.includes(currentItemValue)
				: context.selectedValue === currentItemValue
			: context?.inputValue === value;

	return (
		<ItemContext.Provider value={{ value, disabled }}>
			<div
				id={context?.rootId ? `${context.rootId}-item-${index}` : undefined}
				role="option"
				tabIndex={-1}
				aria-disabled={disabled}
				aria-selected={isSelected}
				data-scope="combobox"
				data-part="item"
				data-index={index}
				data-value={value}
				data-item-value={currentItemValue}
				data-disabled={disabled ? "" : undefined}
				data-highlighted={isHighlighted ? "" : undefined}
				data-state={isSelected ? "checked" : "unchecked"}
				class={cx(context?.styles.item, classProp)}
				{...rest}
			>
				{children}
			</div>
		</ItemContext.Provider>
	);
}

export function ItemText(
	props: PropsWithChildren<{
		class?: string;
		index?: number;
		value?: string;
		itemValue?: string;
		disabled?: boolean;
	}>,
) {
	const {
		children,
		class: classProp,
		index,
		value,
		itemValue,
		disabled,
		...rest
	} = props;
	const context = useComboboxContext();
	const item = useComboboxItemContext();
	const textValue = value || item?.value || "";
	const currentItemValue = itemValue ?? textValue;
	const isSelected =
		context?.selectedValue !== undefined
			? Array.isArray(context.selectedValue)
				? context.selectedValue.includes(currentItemValue)
				: context.selectedValue === currentItemValue
			: context?.inputValue === textValue;
	const isHighlighted = context?.highlightedIndex === index;

	return (
		<span
			data-scope="combobox"
			data-part="item-text"
			data-state={isSelected ? "checked" : "unchecked"}
			data-disabled={disabled || item?.disabled ? "" : undefined}
			data-highlighted={isHighlighted ? "" : undefined}
			class={cx(context?.styles.itemText, classProp)}
			{...rest}
		>
			{children}
		</span>
	);
}

export function ItemIndicator(
	props: PropsWithChildren<{
		class?: string;
		value?: string;
		itemValue?: string;
	}>,
) {
	const { children, class: classProp, value, itemValue, ...rest } = props;
	const context = useComboboxContext();
	const item = useComboboxItemContext();
	const textValue = value || item?.value || "";
	const currentItemValue = itemValue ?? textValue;
	const isSelected =
		context?.selectedValue !== undefined
			? Array.isArray(context.selectedValue)
				? context.selectedValue.includes(currentItemValue)
				: context.selectedValue === currentItemValue
			: context?.inputValue === textValue;

	return (
		<div
			data-scope="combobox"
			data-part="item-indicator"
			data-state={isSelected ? "checked" : "unchecked"}
			class={cx(context?.styles.itemIndicator, classProp)}
			style={{ display: isSelected ? "inline-flex" : "none" }}
			{...rest}
		>
			{children || <CheckIcon width="16" height="16" />}
		</div>
	);
}

export function ItemGroup(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useComboboxContext();
	return (
		<div
			role="presentation"
			data-scope="combobox"
			data-part="item-group"
			class={cx(context?.styles.itemGroup, classProp)}
			{...rest}
		>
			{children}
		</div>
	);
}

export function ItemGroupLabel(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useComboboxContext();
	return (
		<div
			data-scope="combobox"
			data-part="item-group-label"
			class={cx(context?.styles.itemGroupLabel, classProp)}
			{...rest}
		>
			{children}
		</div>
	);
}

export function Empty(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useComboboxContext();
	return (
		<div
			data-scope="combobox"
			data-part="empty"
			class={cx(context?.styles.empty, classProp)}
			{...rest}
		>
			{children}
		</div>
	);
}

export function Context(props: { children: (context: any) => any }) {
	const context = useComboboxContext();
	return props.children(context);
}

export interface ComboboxFlattenedProps extends RootProps {
	items?: ComboboxItem[];
	label?: Child;
	placeholder?: string;
	allowClear?: boolean;
	closeOnSelect?: boolean;
	name?: string;
	value?: string;
	defaultValue?: string;
	helperText?: Child;
	onValueChange?: (value: string) => void;
}

export function ComboboxStructure(props: ComboboxFlattenedProps) {
	const {
		items = [],
		label,
		placeholder,
		allowClear,
		helperText,
		errorText,
		children,
	} = props;
	const context = useComboboxContext();

	const filterText =
		context?.searchQuery !== undefined
			? context.searchQuery
			: context?.inputValue || "";

	const filteredItems = items.filter((item) =>
		item.label.toLowerCase().includes(filterText.toLowerCase()),
	);

	return (
		<>
			{label && <Label>{label}</Label>}
			<Control>
				<Input
					placeholder={placeholder}
					aria-controls={
						context?.rootId ? `${context.rootId}-listbox` : undefined
					}
					aria-activedescendant={
						context?.highlightedIndex !== undefined &&
						context.highlightedIndex >= 0 &&
						context?.rootId
							? `${context.rootId}-item-${context.highlightedIndex}`
							: undefined
					}
				/>
				<IndicatorGroup>
					{allowClear && <ClearTrigger />}
					<Trigger />
				</IndicatorGroup>
			</Control>
			<Positioner>
				<Content>
					<List id={context?.rootId ? `${context.rootId}-listbox` : undefined}>
						{filteredItems.length > 0 ? (
							filteredItems.map((item, index) => (
								<Item
									key={item.value}
									value={item.label}
									itemValue={item.value}
									disabled={item.disabled}
									index={index}
								>
									<ItemText
										index={index}
										value={item.label}
										itemValue={item.value}
										disabled={item.disabled}
									>
										{item.label}
									</ItemText>
									<ItemIndicator value={item.label} itemValue={item.value} />
								</Item>
							))
						) : (
							<Empty>No results found</Empty>
						)}
					</List>
				</Content>
			</Positioner>
			{helperText && <HelperText>{helperText}</HelperText>}
			<ErrorText>{errorText}</ErrorText>
			{children}
		</>
	);
}

export interface InteractiveComboboxProps extends ComboboxFlattenedProps {
	id?: string;
}

export function InteractiveCombobox(props: InteractiveComboboxProps) {
	const {
		open: openProp,
		inputValue: inputValueProp,
		highlightedIndex: highlightedIndexProp,
		id: idProp,
		items = [],
		closeOnSelect,
		name,
		value: valueProp,
		defaultValue: defaultValueProp,
		onValueChange,
		multiple,
		...rest
	} = props;

	// Manage controlled/uncontrolled selected value
	const [localSelectedValue, setLocalSelectedValue] = useState<
		string | string[]
	>(() => {
		const val = valueProp ?? defaultValueProp;
		return multiple
			? Array.isArray(val)
				? val
				: val
					? [val as string]
					: []
			: ((val as string) ?? "");
	});
	const isValueControlled = valueProp !== undefined;
	const selectedValue = isValueControlled ? valueProp : localSelectedValue;

	// Find initial input text based on selected value (empty for multiple)
	const initialInputValue = multiple
		? (inputValueProp ?? "")
		: (() => {
				const val = isValueControlled ? valueProp : localSelectedValue;
				const initialItem = items.find((item) => item.value === val);
				return initialItem ? initialItem.label : (inputValueProp ?? "");
			})();

	const [isOpen, setIsOpen] = useState(openProp ?? false);
	const [inputValue, setInputValue] = useState(initialInputValue);
	const [searchQuery, setSearchQuery] = useState("");
	const [highlightedIndex, setHighlightedIndex] = useState(
		highlightedIndexProp ?? -1,
	);

	const isControlled = openProp !== undefined;
	const open = isControlled ? openProp : isOpen;

	const filterText = searchQuery;
	const filteredItems = items.filter((item) =>
		item.label.toLowerCase().includes(filterText.toLowerCase()),
	);
	// `.filter()` above returns a new array identity every render, so the
	// listener-attaching effect below reads this ref instead of closing over
	// `filteredItems` directly — otherwise that array in its dependency array
	// makes the effect tear down and reattach its DOM listeners on every
	// render (even a mere hover-triggered highlightedIndex change), and a
	// click landing in that reattachment gap gets silently dropped.
	const filteredItemsRef = useRef(filteredItems);
	filteredItemsRef.current = filteredItems;

	const fallbackId = useId();
	const rootId = idProp || `combobox-${fallbackId}`;

	// Lets an ancestor Dialog/Drawer's Escape/Tab handling know this Combobox
	// is the topmost open overlay while it's open (see useOverlayStackEntry).
	useOverlayStackEntry(rootId, open);

	const handleToggleRef = useRef<() => void>(() => {});
	const handleCloseRef = useRef<() => void>(() => {});
	const handleInputChangeRef = useRef<(val: string) => void>(() => {});
	const handleItemSelectRef = useRef<(label: string, val: string) => void>(
		() => {},
	);
	const handleSetHighlightedIndexRef = useRef<(index: number) => void>(
		() => {},
	);

	const handleToggle = () => {
		if (!isControlled) {
			setIsOpen((prev) => {
				const nextOpen = !prev;
				if (nextOpen) {
					setSearchQuery(""); // show full list on open
				}
				return nextOpen;
			});
		}
	};

	const handleClose = () => {
		if (!isControlled) {
			setIsOpen(false);
		}
	};

	const handleInputChange = (val: string) => {
		setInputValue(val);
		setSearchQuery(val);
		if (!isControlled && !isOpen) {
			setIsOpen(true);
		}
		props.onInputChange?.(val);
	};

	const handleItemSelect = (label: string, val: string) => {
		if (multiple) {
			const currentList = Array.isArray(selectedValue) ? selectedValue : [];
			const nextList = currentList.includes(val)
				? currentList.filter((item) => item !== val)
				: [...currentList, val];

			if (!isValueControlled) {
				setLocalSelectedValue(nextList);
			}
			setInputValue("");
			setSearchQuery("");
			setHighlightedIndex(-1);

			const closeOnSelectAttr = closeOnSelect ?? false;
			if (!isControlled && closeOnSelectAttr) {
				setIsOpen(false);
			}

			props.onItemSelect?.(val);
			onValueChange?.(nextList);
		} else {
			if (!isValueControlled) {
				setLocalSelectedValue(val);
			}
			setInputValue(label);
			setSearchQuery(""); // clear search query on selection
			setHighlightedIndex(-1);
			const closeOnSelectAttr = closeOnSelect ?? true;
			if (!isControlled && closeOnSelectAttr) {
				setIsOpen(false);
			}
			props.onItemSelect?.(val);
			onValueChange?.(val);
		}
	};

	const handleSetHighlightedIndex = (index: number) => {
		setHighlightedIndex(index);
	};

	// Store handlers in refs to prevent closure stale problems in useEffect
	useEffect(() => {
		handleToggleRef.current = handleToggle;
		handleCloseRef.current = handleClose;
		handleInputChangeRef.current = handleInputChange;
		handleItemSelectRef.current = handleItemSelect;
		handleSetHighlightedIndexRef.current = handleSetHighlightedIndex;
	}, [
		handleToggle,
		handleClose,
		handleInputChange,
		handleItemSelect,
		handleSetHighlightedIndex,
	]);

	// Sync inputValue with controlled valueProp changes
	useEffect(() => {
		if (valueProp !== undefined) {
			if (multiple) {
				setInputValue("");
			} else {
				const matchingItem = items.find((item) => item.value === valueProp);
				if (matchingItem) {
					setInputValue(matchingItem.label);
				} else {
					setInputValue("");
				}
			}
		}
	}, [valueProp, items, multiple]);

	// Scroll highlighted item into view automatically
	useEffect(() => {
		if (highlightedIndex !== -1 && open) {
			const root = document.getElementById(rootId);
			if (root) {
				const list = root.querySelector('[data-part="list"]') as HTMLElement;
				const item = root.querySelector(
					`[data-part="item"][data-index="${highlightedIndex}"]`,
				) as HTMLElement;
				if (list && item) {
					const listRect = list.getBoundingClientRect();
					const itemRect = item.getBoundingClientRect();
					if (itemRect.bottom > listRect.bottom) {
						list.scrollTop += itemRect.bottom - listRect.bottom;
					} else if (itemRect.top < listRect.top) {
						list.scrollTop -= listRect.top - itemRect.top;
					}
				}
			}
		}
	}, [highlightedIndex, open, rootId]);

	// Attach event listeners using event delegation
	useEffect(() => {
		const root = document.getElementById(rootId);
		if (!root) {
			console.error("InteractiveCombobox: root element not found:", rootId);
			return;
		}
		console.log("InteractiveCombobox: attaching event listeners for", rootId);

		const handleClick = (e: Event) => {
			const target = (e.target as HTMLElement).closest(
				"[data-part]",
			) as HTMLElement;
			if (!target) return;

			const dataPart = target.getAttribute("data-part");
			const isDisabled =
				target.hasAttribute("data-disabled") || target.hasAttribute("disabled");
			if (isDisabled) return;

			if (dataPart === "trigger") {
				handleToggleRef.current?.();
			} else if (dataPart === "clear-trigger") {
				const inputElement = root.querySelector(
					'[data-part="input"]',
				) as HTMLInputElement | null;
				if (inputElement) {
					inputElement.value = "";
				}
				handleInputChangeRef.current("");
				if (!isValueControlled) {
					setLocalSelectedValue(multiple ? [] : "");
				}
				props.onItemSelect?.("");
				onValueChange?.(multiple ? [] : "");
			} else if (dataPart === "item") {
				const label = target.getAttribute("data-value") || "";
				const val = target.getAttribute("data-item-value") || label;
				const inputElement = root.querySelector(
					'[data-part="input"]',
				) as HTMLInputElement | null;
				if (inputElement) {
					inputElement.value = multiple ? "" : label;
				}
				handleItemSelectRef.current?.(label, val);
			}
		};

		const handleMouseOver = (e: MouseEvent) => {
			const target = (e.target as HTMLElement).closest(
				'[data-part="item"]',
			) as HTMLElement;
			if (target && !target.hasAttribute("data-disabled")) {
				const idxAttr = target.getAttribute("data-index");
				if (idxAttr !== null) {
					const index = parseInt(idxAttr, 10);
					if (!Number.isNaN(index)) {
						handleSetHighlightedIndexRef.current(index);
					}
				}
			}
		};

		// Close dropdown on outside click/pointerdown
		const handleDocumentClick = (e: MouseEvent) => {
			if (!root.contains(e.target as Node)) {
				handleCloseRef.current();
			}
		};

		// Attach event listeners
		root.addEventListener("click", handleClick);
		root.addEventListener("mouseover", handleMouseOver as any);
		document.addEventListener("pointerdown", handleDocumentClick);

		// Handle input change for opening/closing
		const handleInputEvent = (e: Event) => {
			const input = e.target as HTMLInputElement;
			const val = input.value;
			handleInputChangeRef.current(val);
			handleSetHighlightedIndexRef.current(-1);
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			const currentOpen = root.getAttribute("data-state") === "open";
			// Get indices of all non-disabled items currently matched/rendered
			const enabledIndices = filteredItemsRef.current
				.map((item, index) => (item.disabled ? null : index))
				.filter((idx): idx is number => idx !== null);

			if (e.key === "ArrowDown") {
				e.preventDefault();
				if (!currentOpen) {
					handleToggleRef.current();
					if (enabledIndices.length > 0) {
						handleSetHighlightedIndexRef.current(enabledIndices[0]!);
					}
				} else {
					setHighlightedIndex((prev) => {
						if (enabledIndices.length === 0) return -1;
						const currentIndexInEnabled = enabledIndices.indexOf(prev);
						const nextIndexInEnabled =
							(currentIndexInEnabled + 1) % enabledIndices.length;
						return enabledIndices[nextIndexInEnabled]!;
					});
				}
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				if (!currentOpen) {
					handleToggleRef.current();
					if (enabledIndices.length > 0) {
						handleSetHighlightedIndexRef.current(
							enabledIndices[enabledIndices.length - 1]!,
						);
					}
				} else {
					setHighlightedIndex((prev) => {
						if (enabledIndices.length === 0) return -1;
						const currentIndexInEnabled = enabledIndices.indexOf(prev);
						const nextIndexInEnabled =
							currentIndexInEnabled - 1 < 0
								? enabledIndices.length - 1
								: currentIndexInEnabled - 1;
						return enabledIndices[nextIndexInEnabled]!;
					});
				}
			} else if (e.key === "Home") {
				if (currentOpen) {
					e.preventDefault();
					if (enabledIndices.length > 0) {
						handleSetHighlightedIndexRef.current(enabledIndices[0]!);
					}
				}
			} else if (e.key === "End") {
				if (currentOpen) {
					e.preventDefault();
					if (enabledIndices.length > 0) {
						handleSetHighlightedIndexRef.current(
							enabledIndices[enabledIndices.length - 1]!,
						);
					}
				}
			} else if (e.key === "Enter") {
				if (currentOpen) {
					const highlightedItem = root.querySelector(
						'[data-part="item"][data-highlighted]',
					) as HTMLElement | null;
					if (highlightedItem) {
						e.preventDefault();
						const label = highlightedItem.getAttribute("data-value") || "";
						const val =
							highlightedItem.getAttribute("data-item-value") || label;
						const input = root.querySelector(
							'[data-part="input"]',
						) as HTMLInputElement;
						if (input) {
							input.value = multiple ? "" : label;
						}
						handleItemSelectRef.current(label, val);
					}
				}
			} else if (e.key === "Escape") {
				if (currentOpen) {
					e.preventDefault();
					handleCloseRef.current();
				}
			}
		};

		const handleFocus = () => {
			const control = root.querySelector(
				'[data-part="control"]',
			) as HTMLElement;
			if (control) control.setAttribute("data-focus", "");
		};

		const handleBlur = () => {
			const control = root.querySelector(
				'[data-part="control"]',
			) as HTMLElement;
			if (control) control.removeAttribute("data-focus");
		};

		const inputElement = root.querySelector(
			'[data-part="input"]',
		) as HTMLInputElement | null;
		if (inputElement) {
			inputElement.addEventListener("input", handleInputEvent);
			inputElement.addEventListener("keydown", handleKeyDown as any);
			inputElement.addEventListener("focus", handleFocus);
			inputElement.addEventListener("blur", handleBlur);
		}

		return () => {
			root.removeEventListener("click", handleClick);
			root.removeEventListener("mouseover", handleMouseOver as any);
			document.removeEventListener("pointerdown", handleDocumentClick);
			if (inputElement) {
				inputElement.removeEventListener("input", handleInputEvent);
				inputElement.removeEventListener("keydown", handleKeyDown as any);
				inputElement.removeEventListener("focus", handleFocus);
				inputElement.removeEventListener("blur", handleBlur);
			}
		};
		// `filteredItems` deliberately excluded — see `filteredItemsRef` above.
	}, [rootId, multiple]);

	return (
		<Root
			id={rootId}
			data-state={open ? "open" : "closed"}
			{...rest}
			open={open}
			inputValue={inputValue}
			searchQuery={searchQuery}
			selectedValue={selectedValue}
			highlightedIndex={highlightedIndex}
			items={filteredItems}
			onToggle={handleToggle}
			onClose={handleClose}
			onInputChange={handleInputChange}
			onItemSelect={handleItemSelect}
			setHighlightedIndex={setHighlightedIndex}
			multiple={multiple}
		>
			{name &&
				(Array.isArray(selectedValue) ? (
					selectedValue.map((val) => (
						<input type="hidden" name={name} value={val} key={val} />
					))
				) : (
					<input type="hidden" name={name} value={selectedValue} />
				))}
			<ComboboxStructure {...props} />
		</Root>
	);
}
