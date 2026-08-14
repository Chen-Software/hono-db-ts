import { cx } from "design-system/css";
import type { TagsFieldVariantProps } from "design-system/recipes";
import { tagsField } from "design-system/recipes";
import type { Child, PropsWithChildren } from "hono/jsx";
import { createContext, useContext, useId } from "hono/jsx";
import { CloseIcon } from "../../icons/close";

type TagsFieldStyles = ReturnType<typeof tagsField>;

interface TagsFieldContextValue {
	id: string;
	styles: TagsFieldStyles;
	value: string[];
	inputValue?: string;
	disabled?: boolean;
	readOnly?: boolean;
	invalid?: boolean;
	name?: string;
	labelId: string;
	helperTextId: string;
	errorTextId: string;
	hasHelperText: boolean;
	hasErrorText: boolean;
	errorText?: string;
}

const TagsFieldContext = createContext<TagsFieldContextValue | null>(null);

export const useTagsFieldContext = () => {
	const context = useContext(TagsFieldContext);
	return context;
};

export interface RootProps extends TagsFieldVariantProps, PropsWithChildren {
	value?: string[];
	defaultValue?: string[];
	inputValue?: string;
	defaultInputValue?: string;
	disabled?: boolean;
	readOnly?: boolean;
	invalid?: boolean;
	class?: string;
	id?: string;
	name?: string;
	dir?: "ltr" | "rtl";
	onValueChange?: (details: { value: string[] }) => void;
	onInputValueChange?: (details: { inputValue: string }) => void;
	label?: Child;
	helperText?: Child;
	errorText?: Child;
}

export function Root(props: RootProps) {
	const [variantProps, localProps] = tagsField.splitVariantProps(props);
	const {
		children,
		value: valueProp,
		defaultValue = [],
		inputValue: inputValueProp,
		defaultInputValue = "",
		disabled,
		readOnly,
		invalid,
		class: classProp,
		id: idProp,
		name,
		onValueChange: _onValueChange,
		onInputValueChange: _onInputValueChange,
		label,
		helperText,
		errorText: errorTextProp,
		...restProps
	} = localProps;

	const styles = tagsField(variantProps);
	const fallbackId = useId();
	const id = idProp || `tags-field-${fallbackId}`;

	const value = valueProp ?? defaultValue;
	const inputValue = inputValueProp ?? defaultInputValue;

	const contextValue: TagsFieldContextValue = {
		id,
		styles,
		value,
		inputValue,
		disabled,
		readOnly,
		invalid,
		name,
		labelId: `tags-field::${id}::label`,
		helperTextId: `tags-field::${id}::helper-text`,
		errorTextId: `tags-field::${id}::error-text`,
		hasHelperText: !!helperText,
		hasErrorText: !!errorTextProp,
		errorText: typeof errorTextProp === "string" ? errorTextProp : undefined,
	};

	return (
		<TagsFieldContext.Provider value={contextValue}>
			<div
				id={id}
				data-scope="tags-field"
				data-part="root"
				data-disabled={disabled ? "" : undefined}
				data-readonly={readOnly ? "" : undefined}
				data-invalid={invalid ? "" : undefined}
				class={cx(styles.root, classProp)}
				{...restProps}
			>
				{children || (
					<>
						{label && <Label>{label}</Label>}
						<Control>
							<Items />
							<Input />
						</Control>
						<HiddenInput />
						{helperText && <HelperText>{helperText}</HelperText>}
						<ErrorText>{errorTextProp}</ErrorText>
					</>
				)}
			</div>
		</TagsFieldContext.Provider>
	);
}

export function Label(
	props: PropsWithChildren<{ class?: string; for?: string }>,
) {
	const { children, class: classProp, for: forProp, ...rest } = props;
	const context = useTagsFieldContext();
	if (!context) return null;
	const { styles, disabled, invalid, readOnly, id, labelId } = context;
	return (
		<label
			id={labelId}
			data-part="label"
			for={forProp || `${id}-input`}
			data-disabled={disabled ? "" : undefined}
			data-invalid={invalid ? "" : undefined}
			data-readonly={readOnly ? "" : undefined}
			class={cx(styles?.label, classProp)}
			{...rest}
		>
			{children}
		</label>
	);
}

export function Control(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useTagsFieldContext();
	if (!context) return <div {...rest}>{children}</div>;
	const { styles, disabled, invalid, readOnly } = context;
	return (
		<div
			data-part="control"
			data-disabled={disabled ? "" : undefined}
			data-invalid={invalid ? "" : undefined}
			data-readonly={readOnly ? "" : undefined}
			class={cx(styles?.control, classProp)}
			{...rest}
		>
			{children}
		</div>
	);
}

export function Input(props: { class?: string; placeholder?: string } & any) {
	const { class: classProp, ...rest } = props;
	const context = useTagsFieldContext();
	if (!context) return <input {...rest} />;
	const {
		styles,
		disabled,
		invalid,
		readOnly,
		inputValue,
		id,
		hasHelperText,
		hasErrorText,
		helperTextId,
		errorTextId,
	} = context;
	const describedBy = [
		hasHelperText ? helperTextId : null,
		invalid && hasErrorText ? errorTextId : null,
	]
		.filter(Boolean)
		.join(" ");
	return (
		<input
			id={`${id}-input`}
			data-part="input"
			data-disabled={disabled ? "" : undefined}
			data-invalid={invalid ? "" : undefined}
			data-readonly={readOnly ? "" : undefined}
			disabled={disabled}
			readOnly={readOnly}
			value={inputValue}
			aria-invalid={invalid ? "true" : undefined}
			aria-describedby={describedBy || undefined}
			class={cx(styles?.input, classProp)}
			{...rest}
		/>
	);
}

interface ItemContextValue {
	index: number;
	value: string;
	disabled?: boolean;
}

const ItemContext = createContext<ItemContextValue | null>(null);

export const useItemContext = () => {
	const context = useContext(ItemContext);
	if (!context) {
		throw new Error("useItemContext must be used within a TagsField Item");
	}
	return context;
};

export interface ItemProps extends PropsWithChildren {
	index: number;
	value: string;
	disabled?: boolean;
	class?: string;
}

export function Item(props: ItemProps) {
	const { children, index, value, disabled, class: classProp, ...rest } = props;
	const context = useTagsFieldContext();
	const styles = context?.styles;

	const itemContextValue = {
		index,
		value,
		disabled,
	};

	return (
		<ItemContext.Provider value={itemContextValue}>
			<div
				data-part="item"
				data-index={index}
				data-value={value}
				data-disabled={disabled ? "" : undefined}
				class={cx(styles?.item, classProp)}
				{...rest}
			>
				{children}
			</div>
		</ItemContext.Provider>
	);
}

export function ItemPreview(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useTagsFieldContext();
	const styles = context?.styles;
	const { index, value, disabled } = useItemContext();
	return (
		<div
			data-part="item-preview"
			data-index={index}
			data-value={value}
			data-disabled={disabled ? "" : undefined}
			class={cx(styles?.itemPreview, classProp)}
			{...rest}
		>
			{children}
		</div>
	);
}

export function ItemText(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useTagsFieldContext();
	const styles = context?.styles;
	const { index, value, disabled } = useItemContext();
	return (
		<span
			data-part="item-text"
			data-index={index}
			data-value={value}
			data-disabled={disabled ? "" : undefined}
			class={cx(styles?.itemText, classProp)}
			{...rest}
		>
			{children || value}
		</span>
	);
}

export function ItemInput(props: { class?: string } & any) {
	const { class: classProp, ...rest } = props;
	const context = useTagsFieldContext();
	const styles = context?.styles;
	const { index, value, disabled } = useItemContext();
	return (
		<input
			data-part="item-input"
			data-index={index}
			data-value={value}
			data-disabled={disabled ? "" : undefined}
			class={cx(styles?.itemInput, classProp)}
			style={{ display: "none" }}
			{...rest}
		/>
	);
}

const XIcon = () => <CloseIcon style={{ width: "1em", height: "1em" }} />;

export function ItemDeleteTrigger(
	props: PropsWithChildren<{ class?: string }>,
) {
	const { children, class: classProp, ...rest } = props;
	const context = useTagsFieldContext();
	const styles = context?.styles;
	const { index, value, disabled } = useItemContext();
	return (
		<button
			type="button"
			data-part="item-delete-trigger"
			data-index={index}
			data-value={value}
			data-disabled={disabled ? "" : undefined}
			class={cx(styles?.itemDeleteTrigger, classProp)}
			{...rest}
		>
			{children || <XIcon />}
		</button>
	);
}

export function ClearTrigger(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = useTagsFieldContext();
	const styles = context?.styles;
	const disabled = context?.disabled;
	return (
		<button
			type="button"
			data-part="clear-trigger"
			data-disabled={disabled ? "" : undefined}
			class={cx(styles?.clearTrigger, classProp)}
			{...rest}
		>
			{children || <XIcon />}
		</button>
	);
}

export function HiddenInput(props: { name?: string } & any) {
	const { name, ...rest } = props;
	const context = useTagsFieldContext();
	const value = context?.value ?? [];
	const contextName = context?.name;
	return (
		<input
			type="hidden"
			name={name || contextName}
			value={value.join(",")}
			data-part="hidden-input"
			{...rest}
		/>
	);
}

export function Items(props: { class?: string }) {
	const context = useTagsFieldContext();
	const value = context?.value ?? [];
	return (
		<>
			{value.map((item, index) => (
				<Item key={`${item}-${index}`} index={index} value={item} {...props}>
					<ItemPreview>
						<ItemText />
						<ItemDeleteTrigger />
					</ItemPreview>
					<ItemInput />
				</Item>
			))}
		</>
	);
}

export function HelperText(props: { children?: Child; class?: string }) {
	const context = useTagsFieldContext();
	const styles = context?.styles;
	return (
		<div
			id={context?.helperTextId}
			data-part="helper-text"
			class={cx(styles?.helperText, props.class)}
			data-disabled={context?.disabled ? "" : undefined}
			data-invalid={context?.invalid ? "" : undefined}
			data-readonly={context?.readOnly ? "" : undefined}
		>
			{props.children}
		</div>
	);
}

export function ErrorText(props: { children?: Child; class?: string }) {
	const context = useTagsFieldContext();
	const styles = context?.styles;
	const content = props.children || context?.errorText;
	if (context?.invalid && content) {
		return (
			<div
				id={context?.errorTextId}
				data-part="error-text"
				aria-live="polite"
				class={cx(styles?.errorText, props.class)}
				data-disabled={context?.disabled ? "" : undefined}
				data-invalid={context?.invalid ? "" : undefined}
				data-readonly={context?.readOnly ? "" : undefined}
			>
				{content}
			</div>
		);
	}
	return null;
}
