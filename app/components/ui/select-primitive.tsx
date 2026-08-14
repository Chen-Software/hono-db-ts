import { cx } from "design-system/css";
import type { SelectVariantProps } from "design-system/recipes";
import { select } from "design-system/recipes";
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

type SelectStyles = ReturnType<typeof select>;

interface SelectItem {
	label: string;
	value: string;
	disabled?: boolean;
}

interface SelectContextValue {
	styles: SelectStyles;
	open: boolean;
	selectedValues: string[];
	highlightedIndex: number;
	items: SelectItem[];
	rootId: string;
	multiple?: boolean;
	disabled?: boolean;
	invalid?: boolean;
	readOnly?: boolean;
	required?: boolean;
	name?: string;
	errorText?: Child;
	onToggle?: () => void;
	onClose?: () => void;
	onItemSelect?: (value: string) => void;
	onClear?: () => void;
	setHighlightedIndex?: (index: number) => void;
}

interface RootProps extends SelectVariantProps, PropsWithChildren {
	open?: boolean;
	selectedValues?: string[];
	highlightedIndex?: number;
	items?: SelectItem[];
	multiple?: boolean;
	disabled?: boolean;
	invalid?: boolean;
	readOnly?: boolean;
	required?: boolean;
	name?: string;
	errorText?: Child;
	onToggle?: () => void;
	onClose?: () => void;
	onItemSelect?: (value: string) => void;
	onClear?: () => void;
	onValueChange?: (values: string[]) => void;
	onOpenChange?: (open: boolean) => void;
	setHighlightedIndex?: (index: number) => void;
	class?: string;
	id?: string;
	style?: any;
	[key: string]: any;
}

interface SelectFlattenedProps extends RootProps {
	items?: SelectItem[];
	label?: Child;
	placeholder?: string;
	allowClear?: boolean;
	defaultValue?: string[];
	deselectable?: boolean;
	helperText?: Child;
}

interface InteractiveSelectProps extends SelectFlattenedProps {
	id?: string;
}

const SelectContext = createContext<SelectContextValue | null>(null);

const ItemContext = createContext<{
	value: string;
	disabled?: boolean;
} | null>(null);

const useSelectContext = () => {
	const context = useContext(SelectContext);
	return context;
};

function Root(props: RootProps) {
	const [variantProps, localProps] = select.splitVariantProps(props);
	const {
		children,
		open = false,
		selectedValues = [],
		highlightedIndex = -1,
		items = [],
		multiple = false,
		disabled,
		invalid,
		readOnly,
		required,
		name,
		errorText,
		onToggle,
		onClose,
		onItemSelect,
		onClear,
		onValueChange,
		onOpenChange,
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
		defaultValue: _defaultValue,
		deselectable: _deselectable,
		helperText: _helperText,
		...domProps
	} = rest;

	const styles = select(variantProps);
	const rootId = id || "select";

	return (
		<SelectContext.Provider
			value={{
				styles,
				open,
				selectedValues,
				highlightedIndex,
				items,
				rootId,
				multiple,
				disabled,
				invalid,
				readOnly,
				required,
				name,
				errorText,
				onToggle,
				onClose,
				onItemSelect,
				onClear,
				setHighlightedIndex,
			}}
		>
			<div
				id={rootId}
				data-scope="select"
				data-part="root"
				data-overlay-root
				data-state={open ? "open" : "closed"}
				data-disabled={disabled ? "" : undefined}
				data-invalid={invalid ? "" : undefined}
				class={cx(styles.root, classProp)}
				style={{ position: "relative", ...style }}
				{...domProps}
			>
				{children}
			</div>
		</SelectContext.Provider>
	);
}

function RequiredIndicator(props: { children?: Child; class?: string }) {
	const context = useSelectContext();
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

function HelperText(props: { children?: Child; class?: string }) {
	const context = useSelectContext();
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

function ErrorText(props: { children?: Child; class?: string }) {
	const context = useSelectContext();
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

function Label(props: PropsWithChildren<{ class?: string; htmlFor?: string }>) {
	const { children, class: classProp, htmlFor, ...rest } = props;
	const context = useSelectContext();
	return (
		<label
			htmlFor={
				htmlFor || (context?.rootId ? `${context.rootId}-trigger` : undefined)
			}
			data-scope="select"
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

function Control(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useSelectContext();
	return (
		<div
			data-scope="select"
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

function Trigger(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useSelectContext();
	const activeDescendant =
		context?.open && context.highlightedIndex >= 0
			? `${context.rootId}-item-${context.highlightedIndex}`
			: undefined;

	return (
		<button
			id={context?.rootId ? `${context.rootId}-trigger` : undefined}
			type="button"
			role="combobox"
			aria-haspopup="listbox"
			aria-expanded={context?.open}
			aria-controls={context?.rootId ? `${context.rootId}-listbox` : undefined}
			aria-activedescendant={activeDescendant}
			aria-invalid={context?.invalid}
			aria-required={context?.required}
			data-scope="select"
			data-part="trigger"
			data-state={context?.open ? "open" : "closed"}
			data-disabled={context?.disabled ? "" : undefined}
			data-invalid={context?.invalid ? "" : undefined}
			data-readonly={context?.readOnly ? "" : undefined}
			data-placeholder={
				context && context.selectedValues.length === 0 ? "" : undefined
			}
			disabled={context?.disabled}
			class={cx(context?.styles.trigger, classProp)}
			{...rest}
		>
			{children}
		</button>
	);
}

function ValueText(
	props: PropsWithChildren<{ class?: string; placeholder?: string }>,
) {
	const {
		children,
		class: classProp,
		placeholder = "Select option",
		...rest
	} = props;
	const context = useSelectContext();

	let textContent: Child = children;
	let isPlaceholder = false;
	if (!textContent && context) {
		const selectedItems = context.items.filter((item) =>
			context.selectedValues.includes(item.value),
		);
		if (selectedItems.length > 0) {
			textContent = selectedItems.map((item) => item.label).join(", ");
		} else {
			textContent = placeholder;
			isPlaceholder = true;
		}
	}

	return (
		<span
			data-scope="select"
			data-part="value-text"
			data-placeholder={isPlaceholder ? "" : undefined}
			class={cx(context?.styles.valueText, classProp)}
			{...rest}
		>
			{textContent}
		</span>
	);
}

function Indicator(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useSelectContext();
	return (
		<span
			data-scope="select"
			data-part="indicator"
			data-state={context?.open ? "open" : "closed"}
			class={cx(context?.styles.indicator, classProp)}
			{...rest}
		>
			{children || (
				<ChevronsUpDownIcon width="16" height="16" aria-hidden="true" />
			)}
		</span>
	);
}

function IndicatorGroup(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useSelectContext();
	return (
		<span
			data-scope="select"
			data-part="indicator-group"
			class={cx(context?.styles.indicatorGroup, classProp)}
			{...rest}
		>
			{children}
		</span>
	);
}

function Positioner(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useSelectContext();
	return (
		<div
			data-scope="select"
			data-part="positioner"
			data-state={context?.open ? "open" : "closed"}
			class={cx(context?.styles.positioner, classProp)}
			{...rest}
		>
			{children}
		</div>
	);
}

function Content(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useSelectContext();
	return (
		<div
			data-scope="select"
			data-part="content"
			data-state={context?.open ? "open" : "closed"}
			class={cx(context?.styles.content, classProp)}
			{...rest}
		>
			{children}
		</div>
	);
}

function List(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useSelectContext();
	return (
		<div
			role="listbox"
			id={context?.rootId ? `${context.rootId}-listbox` : undefined}
			aria-labelledby={
				context?.rootId ? `${context.rootId}-trigger` : undefined
			}
			data-scope="select"
			data-part="list"
			class={cx(context?.styles.list, classProp)}
			{...rest}
		>
			{children}
		</div>
	);
}

function Item(
	props: PropsWithChildren<{
		value: string;
		disabled?: boolean;
		index?: number;
		class?: string;
		[key: string]: any;
	}>,
) {
	const {
		children,
		value,
		disabled,
		index = 0,
		class: classProp,
		...rest
	} = props;
	const context = useSelectContext();
	const isSelected = context?.selectedValues.includes(value) ?? false;
	const isHighlighted = context?.highlightedIndex === index;

	return (
		<ItemContext.Provider value={{ value, disabled }}>
			<div
				id={context?.rootId ? `${context.rootId}-item-${index}` : undefined}
				role="option"
				tabIndex={-1}
				aria-selected={isSelected}
				aria-disabled={disabled}
				data-scope="select"
				data-part="item"
				data-value={value}
				data-index={index}
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

function ItemText(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useSelectContext();
	const item = useContext(ItemContext);
	const isSelected = item
		? context?.selectedValues.includes(item.value)
		: false;

	return (
		<span
			data-scope="select"
			data-part="item-text"
			data-state={isSelected ? "checked" : "unchecked"}
			class={cx(context?.styles.itemText, classProp)}
			{...rest}
		>
			{children}
		</span>
	);
}

function ItemIndicator(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useSelectContext();
	const item = useContext(ItemContext);
	const isSelected = item
		? context?.selectedValues.includes(item.value)
		: false;

	return (
		<div
			data-scope="select"
			data-part="item-indicator"
			data-state={isSelected ? "checked" : "unchecked"}
			class={cx(context?.styles.itemIndicator, classProp)}
			style={{ display: isSelected ? "inline-flex" : "none" }}
			{...rest}
		>
			{children || <CheckIcon width="16" height="16" aria-hidden="true" />}
		</div>
	);
}

function ItemGroup(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useSelectContext();
	return (
		<div
			role="group"
			data-scope="select"
			data-part="item-group"
			class={cx(context?.styles.itemGroup, classProp)}
			{...rest}
		>
			{children}
		</div>
	);
}

function ItemGroupLabel(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useSelectContext();
	return (
		<div
			data-scope="select"
			data-part="item-group-label"
			class={cx(context?.styles.itemGroupLabel, classProp)}
			{...rest}
		>
			{children}
		</div>
	);
}

function ClearTrigger(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useSelectContext();
	const hasSelection = (context?.selectedValues.length ?? 0) > 0;

	return (
		<button
			type="button"
			aria-label="Clear selection"
			data-scope="select"
			data-part="clear-trigger"
			disabled={context?.disabled || context?.readOnly}
			hidden={!hasSelection}
			class={cx(context?.styles.clearTrigger, classProp)}
			{...rest}
		>
			{children || <CloseIcon width="16" height="16" aria-hidden="true" />}
		</button>
	);
}

function HiddenSelect(props: { items?: SelectItem[] }) {
	const context = useSelectContext();
	const selectItems = props.items || context?.items || [];
	return (
		<select
			data-scope="select"
			data-part="hidden-select"
			name={context?.name}
			multiple={context?.multiple}
			disabled={context?.disabled}
			required={context?.required}
			aria-hidden="true"
			tabIndex={-1}
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
		>
			{selectItems.map((item) => (
				<option
					key={item.value}
					value={item.value}
					selected={context?.selectedValues.includes(item.value)}
					disabled={item.disabled}
				>
					{item.label}
				</option>
			))}
		</select>
	);
}

function SelectStructure(props: SelectFlattenedProps) {
	const {
		items = [],
		label,
		placeholder,
		allowClear,
		helperText,
		errorText,
		children,
	} = props;

	return (
		<>
			{label && <Label>{label}</Label>}
			<Control>
				<Trigger>
					<ValueText placeholder={placeholder} />
					<IndicatorGroup>
						<Indicator />
					</IndicatorGroup>
				</Trigger>
				{allowClear && <ClearTrigger />}
			</Control>
			<Positioner>
				<Content>
					<List>
						{items.map((item, index) => (
							<Item
								key={item.value}
								value={item.value}
								disabled={item.disabled}
								index={index}
							>
								<ItemText>{item.label}</ItemText>
								<ItemIndicator />
							</Item>
						))}
					</List>
				</Content>
			</Positioner>
			<HiddenSelect items={items} />
			{helperText && <HelperText>{helperText}</HelperText>}
			<ErrorText>{errorText}</ErrorText>
			{children}
		</>
	);
}

function InteractiveSelect(props: InteractiveSelectProps) {
	const {
		open: openProp,
		selectedValues: selectedValuesProp,
		defaultValue,
		highlightedIndex: highlightedIndexProp,
		id: idProp,
		items = [],
		multiple = false,
		deselectable = false,
		onValueChange,
		onItemSelect,
		onClear,
		onOpenChange,
		disabled,
		invalid,
		readOnly,
		required,
		name,
		...rest
	} = props;

	const [isOpen, setIsOpen] = useState(openProp ?? false);
	const [selectedValues, setSelectedValues] = useState<string[]>(
		selectedValuesProp ?? defaultValue ?? [],
	);
	const [highlightedIndex, setHighlightedIndex] = useState(
		highlightedIndexProp ?? -1,
	);

	const isControlled = openProp !== undefined;
	const open = isControlled ? openProp : isOpen;

	const fallbackId = useId();
	const rootId = idProp || `select-${fallbackId}`;

	// Lets an ancestor Dialog/Drawer's Escape/Tab handling know this Select
	// is the topmost open overlay while it's open (see useOverlayStackEntry).
	useOverlayStackEntry(rootId, open);

	// Sync controlled props
	useEffect(() => {
		if (selectedValuesProp !== undefined) {
			setSelectedValues(selectedValuesProp);
		}
	}, [selectedValuesProp]);

	useEffect(() => {
		if (openProp !== undefined) {
			setIsOpen(openProp);
		}
	}, [openProp]);

	useEffect(() => {
		if (highlightedIndexProp !== undefined) {
			setHighlightedIndex(highlightedIndexProp);
		}
	}, [highlightedIndexProp]);

	const handleToggleRef = useRef<() => void>(() => {});
	const handleCloseRef = useRef<() => void>(() => {});
	const handleOpenRef = useRef<(next: boolean, hint?: "last") => void>(
		() => {},
	);
	const handleItemSelectRef = useRef<(val: string) => void>(() => {});
	const handleClearRef = useRef<() => void>(() => {});
	const handleSetHighlightedIndexRef = useRef<(index: number) => void>(
		() => {},
	);
	const itemsRef = useRef<SelectItem[]>(items);
	itemsRef.current = items;
	const typeaheadRef = useRef<{ buffer: string; timer: number | undefined }>({
		buffer: "",
		timer: undefined,
	});

	// Initial highlight when the list opens: the first selected enabled item,
	// otherwise the first (or last, for ArrowUp) enabled item.
	const initialHighlight = (hint?: "last") => {
		const selectedIdx = items.findIndex(
			(item) => !item.disabled && selectedValues.includes(item.value),
		);
		if (selectedIdx !== -1) {
			return selectedIdx;
		}
		if (hint === "last") {
			for (let i = items.length - 1; i >= 0; i--) {
				if (!items[i].disabled) return i;
			}
			return -1;
		}
		return items.findIndex((item) => !item.disabled);
	};

	const handleOpen = (next: boolean, hint?: "last") => {
		if (disabled || readOnly) {
			return;
		}
		if (!isControlled) {
			setIsOpen(next);
		}
		setHighlightedIndex(next ? initialHighlight(hint) : -1);
		if (next !== open) {
			onOpenChange?.(next);
		}
	};

	const handleToggle = () => {
		handleOpen(!open);
	};

	const handleClose = () => {
		handleOpen(false);
	};

	const handleItemSelect = (val: string) => {
		let nextValues: string[];
		if (multiple) {
			if (selectedValues.includes(val)) {
				nextValues = selectedValues.filter((v) => v !== val);
			} else {
				nextValues = [...selectedValues, val];
			}
		} else {
			if (deselectable && selectedValues.includes(val)) {
				nextValues = [];
			} else {
				nextValues = [val];
			}
			handleOpen(false);
		}
		setSelectedValues(nextValues);
		onItemSelect?.(val);
		onValueChange?.(nextValues);
	};

	const handleClear = () => {
		if (selectedValues.length === 0) {
			return;
		}
		const nextValues: string[] = [];
		setSelectedValues(nextValues);
		onClear?.();
		onValueChange?.(nextValues);
	};

	const handleSetHighlightedIndex = (index: number) => {
		setHighlightedIndex(index);
	};

	useEffect(() => {
		handleToggleRef.current = handleToggle;
		handleCloseRef.current = handleClose;
		handleOpenRef.current = handleOpen;
		handleItemSelectRef.current = handleItemSelect;
		handleClearRef.current = handleClear;
		handleSetHighlightedIndexRef.current = handleSetHighlightedIndex;
	}, [
		handleToggle,
		handleClose,
		handleOpen,
		handleItemSelect,
		handleClear,
		handleSetHighlightedIndex,
	]);

	// Keep the highlighted option visible while navigating with the keyboard.
	useEffect(() => {
		if (!open || highlightedIndex < 0) {
			return;
		}
		const root = document.getElementById(rootId);
		if (!root) return;
		const highlighted = root.querySelector(
			`[data-part="item"][data-index="${highlightedIndex}"]`,
		);
		highlighted?.scrollIntoView({ block: "nearest" });
	}, [rootId, open, highlightedIndex]);

	// Attach event listeners using event delegation
	useEffect(() => {
		const root = document.getElementById(rootId);
		if (!root) {
			return;
		}

		const focusTrigger = () => {
			const trigger = root.querySelector<HTMLElement>('[data-part="trigger"]');
			trigger?.focus();
		};

		// Indices (into the full items list) of the enabled options, in DOM order.
		const getEnabledIndices = () =>
			Array.from(
				root.querySelectorAll<HTMLElement>(
					'[data-part="item"]:not([data-disabled])',
				),
			)
				.map((el) => Number(el.getAttribute("data-index")))
				.filter((index) => Number.isInteger(index) && index >= 0);

		const handleClick = (e: Event) => {
			if (disabled || readOnly) return;
			const target = e.target as HTMLElement;
			const clearTrigger = target.closest('[data-part="clear-trigger"]');
			const trigger = target.closest('[data-part="trigger"]');
			const item = target.closest('[data-part="item"]');

			if (clearTrigger) {
				e.stopPropagation();
				handleClearRef.current?.();
				focusTrigger();
			} else if (trigger) {
				const currentOpen = root.getAttribute("data-state") === "open";
				handleOpenRef.current?.(!currentOpen);
			} else if (item && !item.hasAttribute("data-disabled")) {
				const value = item.getAttribute("data-value") || "";
				handleItemSelectRef.current?.(value);
				focusTrigger();
			}
		};

		const handleMouseOver = (e: MouseEvent) => {
			if (disabled || readOnly) return;
			const item = (e.target as HTMLElement).closest('[data-part="item"]');
			if (item && !item.hasAttribute("data-disabled")) {
				const index = Number(item.getAttribute("data-index"));
				if (Number.isInteger(index) && index >= 0) {
					handleSetHighlightedIndexRef.current(index);
				}
			}
		};

		// Click outside handler
		const handleDocumentClick = (e: MouseEvent) => {
			if (!root.contains(e.target as Node)) {
				if (root.getAttribute("data-state") === "open") {
					handleOpenRef.current?.(false);
				}
			}
		};

		root.addEventListener("click", handleClick);
		root.addEventListener("mouseover", handleMouseOver as any);
		document.addEventListener("click", handleDocumentClick);

		// Native-select-style typeahead: accumulate printable keys and jump to
		// the first enabled option whose label starts with the buffer.
		const handleTypeahead = (key: string, currentOpen: boolean) => {
			const typeahead = typeaheadRef.current;
			if (typeahead.timer !== undefined) {
				clearTimeout(typeahead.timer);
			}
			typeahead.buffer += key.toLowerCase();
			typeahead.timer = setTimeout(() => {
				typeahead.buffer = "";
				typeahead.timer = undefined;
			}, 500) as unknown as number;

			const match = itemsRef.current.findIndex(
				(item) =>
					!item.disabled &&
					item.label.toLowerCase().startsWith(typeahead.buffer),
			);
			if (match === -1) {
				return;
			}
			if (currentOpen || multiple) {
				if (!currentOpen) {
					handleOpenRef.current?.(true);
				}
				handleSetHighlightedIndexRef.current(match);
			} else {
				// Closed single select: commit the match directly, like a native <select>
				handleItemSelectRef.current?.(itemsRef.current[match]?.value ?? "");
			}
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			if (disabled || readOnly) return;
			const currentOpen = root.getAttribute("data-state") === "open";
			const enabledIndices = getEnabledIndices();

			if (e.key === "ArrowDown") {
				e.preventDefault();
				if (!currentOpen) {
					handleOpenRef.current?.(true);
				} else if (enabledIndices.length > 0) {
					setHighlightedIndex((prev) => {
						const pos = enabledIndices.indexOf(prev);
						return enabledIndices[(pos + 1) % enabledIndices.length];
					});
				}
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				if (!currentOpen) {
					handleOpenRef.current?.(true, "last");
				} else if (enabledIndices.length > 0) {
					setHighlightedIndex((prev) => {
						const pos = enabledIndices.indexOf(prev);
						return pos <= 0
							? enabledIndices[enabledIndices.length - 1]
							: enabledIndices[pos - 1];
					});
				}
			} else if (e.key === "Home") {
				if (currentOpen && enabledIndices.length > 0) {
					e.preventDefault();
					handleSetHighlightedIndexRef.current(enabledIndices[0]);
				}
			} else if (e.key === "End") {
				if (currentOpen && enabledIndices.length > 0) {
					e.preventDefault();
					handleSetHighlightedIndexRef.current(
						enabledIndices[enabledIndices.length - 1],
					);
				}
			} else if (e.key === "Enter" || e.key === " ") {
				if (currentOpen) {
					const highlightedItem = root.querySelector(
						'[data-part="item"][data-highlighted]',
					) as HTMLElement | null;
					if (highlightedItem) {
						e.preventDefault();
						const value = highlightedItem.getAttribute("data-value") || "";
						handleItemSelectRef.current(value);
					}
				} else if (
					e.key === "Enter" ||
					typeaheadRef.current.buffer.length === 0
				) {
					e.preventDefault();
					handleOpenRef.current?.(true);
				}
			} else if (e.key === "Escape") {
				if (currentOpen) {
					e.preventDefault();
					handleOpenRef.current?.(false);
				}
			} else if (e.key === "Tab") {
				if (currentOpen) {
					handleOpenRef.current?.(false);
				}
			} else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
				handleTypeahead(e.key, currentOpen);
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

		const triggerElement = root.querySelector(
			'[data-part="trigger"]',
		) as HTMLElement | null;
		if (triggerElement) {
			triggerElement.addEventListener("keydown", handleKeyDown as any);
			triggerElement.addEventListener("focus", handleFocus);
			triggerElement.addEventListener("blur", handleBlur);
		}

		return () => {
			root.removeEventListener("click", handleClick);
			root.removeEventListener("mouseover", handleMouseOver as any);
			document.removeEventListener("click", handleDocumentClick);
			if (triggerElement) {
				triggerElement.removeEventListener("keydown", handleKeyDown as any);
				triggerElement.removeEventListener("focus", handleFocus);
				triggerElement.removeEventListener("blur", handleBlur);
			}
			if (typeaheadRef.current.timer !== undefined) {
				clearTimeout(typeaheadRef.current.timer);
			}
		};
	}, [rootId, multiple, disabled, readOnly]);

	return (
		<Root
			id={rootId}
			{...rest}
			open={open}
			selectedValues={selectedValues}
			highlightedIndex={highlightedIndex}
			items={items}
			multiple={multiple}
			disabled={disabled}
			invalid={invalid}
			readOnly={readOnly}
			required={required}
			name={name}
			onToggle={handleToggle}
			onClose={handleClose}
			onItemSelect={handleItemSelect}
			onClear={handleClear}
			setHighlightedIndex={setHighlightedIndex}
		>
			<SelectStructure
				items={items}
				multiple={multiple}
				disabled={disabled}
				invalid={invalid}
				readOnly={readOnly}
				required={required}
				name={name}
				{...rest}
			/>
		</Root>
	);
}

export type {
	InteractiveSelectProps,
	RootProps,
	SelectContextValue,
	SelectFlattenedProps,
	SelectItem,
	SelectStyles,
};
export {
	ClearTrigger,
	Content,
	Control,
	ErrorText,
	HelperText,
	HiddenSelect,
	Indicator,
	IndicatorGroup,
	InteractiveSelect,
	Item,
	ItemGroup,
	ItemGroupLabel,
	ItemIndicator,
	ItemText,
	Label,
	List,
	Positioner,
	RequiredIndicator,
	Root,
	SelectStructure,
	Trigger,
	useSelectContext,
	ValueText,
};
