import { cx } from "design-system/css";
import type { PinFieldVariantProps } from "design-system/recipes";
import { pinField } from "design-system/recipes";
import type { Child, PropsWithChildren } from "hono/jsx";
import { createContext, useContext, useId } from "hono/jsx";
import { type ValidatorFn, validateField } from "./field-primitive";

type PinFieldStyles = ReturnType<typeof pinField>;

/** Character class accepted per box; drives both the `inputMode` and the paste/typed-character filter. */
export type PinFieldFormat = "numeric" | "alphanumeric" | "alphabetic";

/** The box a user would land on next: the first empty one, clamped to the last box once full. */
function getActiveIndex(value: string[], count: number): number {
	const filled = value.reduce((n, v) => (v !== "" ? n + 1 : n), 0);
	return Math.min(filled, Math.max(count - 1, 0));
}

interface PinFieldContextValue {
	id: string;
	styles: PinFieldStyles;
	value: string[];
	count: number;
	format: PinFieldFormat;
	placeholder: string;
	mask?: boolean;
	otp?: boolean;
	disabled?: boolean;
	readOnly?: boolean;
	required?: boolean;
	invalid?: boolean;
	name?: string;
	form?: string;
	activeIndex: number;
	complete: boolean;
	labelId: string;
	helperTextId: string;
	errorTextId: string;
	hasHelperText: boolean;
	hasErrorText: boolean;
	errorText?: string;
}

const PinFieldContext = createContext<PinFieldContextValue | null>(null);

export const usePinFieldContext = () => useContext(PinFieldContext);

export interface RootProps extends PinFieldVariantProps, PropsWithChildren {
	id?: string;
	/** Number of boxes to render. @default 4 */
	count?: number;
	value?: string[];
	defaultValue?: string[];
	/** Character class accepted per box. @default "numeric" */
	format?: PinFieldFormat;
	/** Shown in each empty box. @default "○" */
	placeholder?: string;
	/** Renders each box as `type="password"`, hiding entered characters. */
	mask?: boolean;
	/**
	 * Hints browsers/password managers this is an SMS/email one-time code —
	 * `autoComplete="one-time-code"` is applied to the box the user would fill
	 * next (not every box, which would otherwise confuse autofill UI), letting
	 * the OS offer to fill the whole code into that single box in one shot.
	 */
	otp?: boolean;
	/** Blurs the last box once every box is filled. */
	blurOnComplete?: boolean;
	/** Focuses the first box on mount. */
	autoFocus?: boolean;
	/** Selects a box's existing character on focus, so typing replaces it instead of being blocked. @default true */
	selectOnFocus?: boolean;
	/** Custom per-character regexp source overriding `format`. */
	pattern?: string;
	disabled?: boolean;
	readOnly?: boolean;
	required?: boolean;
	invalid?: boolean;
	name?: string;
	/** HTML `form` id to associate the hidden submit input with, and to locate for `autoSubmit`/reset. */
	form?: string;
	/**
	 * Calls `form.requestSubmit()` once every box is filled. The form is
	 * resolved via `form`, then the hidden input's own `.form`, then the
	 * closest ancestor `<form>`.
	 */
	autoSubmit?: boolean;
	/** Fired right before an `autoSubmit`-triggered submission is attempted. */
	onAutoSubmit?: (valueAsString: string) => void;
	class?: string;
	label?: Child;
	helperText?: Child;
	errorText?: Child;
	validator?: ValidatorFn | string;
	validatorSource?: string;
	dir?: "ltr" | "rtl";
	onValueChange?: (details: { value: string[]; valueAsString: string }) => void;
	onValueComplete?: (details: {
		value: string[];
		valueAsString: string;
	}) => void;
	onValueInvalid?: (details: { index: number; value: string }) => void;
}

export function Root(props: RootProps) {
	const [variantProps, localProps] = pinField.splitVariantProps(props);
	const {
		children,
		id: idProp,
		count = 4,
		value: valueProp,
		defaultValue,
		format = "numeric",
		placeholder = "○",
		mask,
		otp,
		blurOnComplete: _blurOnComplete,
		autoFocus: _autoFocus,
		selectOnFocus: _selectOnFocus,
		pattern: _pattern,
		disabled,
		readOnly,
		required,
		invalid: invalidProp,
		name,
		form,
		autoSubmit: _autoSubmit,
		onAutoSubmit: _onAutoSubmit,
		class: classProp,
		label,
		helperText,
		errorText: errorTextProp,
		validator,
		validatorSource,
		dir,
		onValueChange: _onValueChange,
		onValueComplete: _onValueComplete,
		onValueInvalid: _onValueInvalid,
		...restProps
	} = localProps;
	const effectiveValidator = validator ?? validatorSource;

	const fallbackId = useId();
	const id = idProp || `pin-field-${fallbackId}`;

	const value =
		valueProp ?? defaultValue ?? Array.from({ length: count }, () => "");
	const complete = value.length === count && value.every((v) => v !== "");

	const { isInvalid: validatedInvalid, errorText: validatedErrorText } =
		validateField(value.join(""), undefined, effectiveValidator);
	const invalid = invalidProp !== undefined ? invalidProp : validatedInvalid;
	const errorText = validatedErrorText;

	const styles = pinField(variantProps);

	const contextValue: PinFieldContextValue = {
		id,
		styles,
		value,
		count,
		format,
		placeholder,
		mask,
		otp,
		disabled,
		readOnly,
		required,
		invalid,
		name,
		form,
		activeIndex: getActiveIndex(value, count),
		complete,
		labelId: `pin-field::${id}::label`,
		helperTextId: `pin-field::${id}::helper-text`,
		errorTextId: `pin-field::${id}::error-text`,
		hasHelperText: !!helperText,
		hasErrorText: !!(errorTextProp || errorText),
		errorText:
			errorText ||
			(typeof errorTextProp === "string" ? errorTextProp : undefined),
	};

	return (
		<PinFieldContext.Provider value={contextValue}>
			<div
				id={id}
				data-scope="pin-field"
				data-part="root"
				data-complete={complete ? "" : undefined}
				data-disabled={disabled ? "" : undefined}
				data-invalid={invalid ? "" : undefined}
				dir={dir}
				class={cx(styles.root, classProp)}
				{...restProps}
			>
				{children || (
					<>
						{label && <Label>{label}</Label>}
						<Control>
							<Inputs />
						</Control>
						<HiddenInput />
						{helperText && <HelperText>{helperText}</HelperText>}
						<ErrorText>{errorText || errorTextProp}</ErrorText>
					</>
				)}
			</div>
		</PinFieldContext.Provider>
	);
}

export function Label(
	props: PropsWithChildren<{ class?: string; for?: string }>,
) {
	const { children, class: classProp, for: forProp, ...rest } = props;
	const context = usePinFieldContext();
	const styles = context?.styles;
	return (
		<label
			id={context?.labelId}
			data-part="label"
			for={forProp || (context ? `${context.id}-input-0` : undefined)}
			data-disabled={context?.disabled ? "" : undefined}
			data-invalid={context?.invalid ? "" : undefined}
			data-readonly={context?.readOnly ? "" : undefined}
			class={cx(styles?.label, classProp)}
			{...rest}
		>
			{children}
		</label>
	);
}

export function Control(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const context = usePinFieldContext();
	const styles = context?.styles;
	return (
		<div
			data-scope="pin-field"
			data-part="control"
			data-disabled={context?.disabled ? "" : undefined}
			data-invalid={context?.invalid ? "" : undefined}
			class={cx(styles?.control, classProp)}
			{...rest}
		>
			{children}
		</div>
	);
}

export interface InputProps {
	index: number;
	class?: string;
	[key: string]: unknown;
}

export function Input(props: InputProps) {
	const { index, class: classProp, ...rest } = props;
	const context = usePinFieldContext();
	if (!context) {
		return <input data-part="input" data-index={index} {...rest} />;
	}
	const {
		styles,
		value,
		count,
		format,
		placeholder,
		mask,
		otp,
		disabled,
		readOnly,
		required,
		invalid,
		id,
		form,
		activeIndex,
		complete,
		hasHelperText,
		hasErrorText,
		helperTextId,
		errorTextId,
	} = context;
	const filled = value[index] !== undefined && value[index] !== "";
	const isActive = index === activeIndex;
	// Only the box the user would fill next advertises one-time-code autofill
	// — offering it on every box confuses browsers/password managers into
	// showing a fill affordance on all of them at once.
	const supportsAutoComplete = otp && isActive;
	const describedBy = [
		hasHelperText ? helperTextId : null,
		invalid && hasErrorText ? errorTextId : null,
	]
		.filter(Boolean)
		.join(" ");
	return (
		<input
			id={`${id}-input-${index}`}
			data-scope="pin-field"
			data-part="input"
			data-index={index}
			data-filled={filled ? "" : undefined}
			data-active={isActive ? "" : undefined}
			data-complete={complete && !invalid ? "" : undefined}
			data-disabled={disabled ? "" : undefined}
			data-invalid={invalid ? "" : undefined}
			data-readonly={readOnly ? "" : undefined}
			form={form}
			// Boxes past the next-to-fill one are pulled out of tab order so
			// Tab can't skip ahead of an empty box; click/paste/typing still
			// reach them directly.
			tabIndex={index <= activeIndex ? 0 : -1}
			inputMode={format === "numeric" ? "numeric" : "text"}
			type={mask ? "password" : "text"}
			autoComplete={supportsAutoComplete ? "one-time-code" : "off"}
			data-1p-ignore={otp && !supportsAutoComplete ? "true" : undefined}
			data-lpignore={otp && !supportsAutoComplete ? "true" : undefined}
			data-protonpass-ignore={otp && !supportsAutoComplete ? "true" : undefined}
			data-bwignore={otp && !supportsAutoComplete ? "true" : undefined}
			// The autofill target box accepts the full code length so mobile
			// OS/keyboard suggestions can drop the whole code in at once; the
			// input handler then redistributes it across the remaining boxes.
			maxLength={supportsAutoComplete ? count : 1}
			placeholder={placeholder}
			disabled={disabled}
			readOnly={readOnly}
			required={required}
			aria-label={`${format === "numeric" ? "Digit" : "Character"} ${index + 1} of ${count}`}
			aria-invalid={invalid ? "true" : undefined}
			aria-describedby={describedBy || undefined}
			value={value[index] ?? ""}
			class={cx(styles?.input, classProp)}
			{...rest}
		/>
	);
}

export function Inputs(props: { class?: string }) {
	const context = usePinFieldContext();
	const count = context?.count ?? 0;
	return (
		<>
			{Array.from({ length: count }, (_, index) => (
				<Input key={index} index={index} {...props} />
			))}
		</>
	);
}

export function HiddenInput(
	props: { name?: string; form?: string } & Record<string, unknown>,
) {
	const { name, form, ...rest } = props;
	const context = usePinFieldContext();
	const value = context?.value ?? [];
	return (
		<input
			type="hidden"
			data-part="hidden-input"
			name={name || context?.name}
			form={form || context?.form}
			value={value.join("")}
			{...rest}
		/>
	);
}

export function HelperText(props: { children?: Child; class?: string }) {
	const context = usePinFieldContext();
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
	const context = usePinFieldContext();
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
