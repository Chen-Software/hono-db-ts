import { cx } from "design-system/css";
import type { FieldsetVariantProps } from "design-system/recipes";
import { fieldset } from "design-system/recipes";
import type { Child, PropsWithChildren } from "hono/jsx";
import { createContext, useContext, useId } from "hono/jsx";

export interface FieldsetContextValue {
	id: string;
	disabled?: boolean;
	invalid?: boolean;
	required?: boolean;
	helperTextId: string;
	errorTextId: string;
}

const FieldsetContext = createContext<FieldsetContextValue | null>(null);

// Exported so nested form-control primitives (Field, Switch, ...) can pick up
// the group's disabled/invalid/required state as a fallback — matching Ark
// UI's Fieldset, which "provides contexts such as invalid and disabled for
// form elements."
export const useFieldsetContext = () => useContext(FieldsetContext);

interface FieldsetProps extends FieldsetVariantProps, PropsWithChildren {
	class?: string;
	id?: string;
	disabled?: boolean;
	invalid?: boolean;
	required?: boolean;
	legend?: Child;
	helperText?: Child;
	errorText?: Child;
	[key: string]: unknown;
}

function Fieldset(props: FieldsetProps) {
	const [variantProps, localProps] = fieldset.splitVariantProps(props);
	const {
		children,
		class: classProp,
		id: idProp,
		disabled,
		invalid: invalidProp,
		required,
		legend,
		helperText,
		errorText,
		...restProps
	} = localProps;

	const autoId = useId();
	const id = idProp || autoId;
	const styles = fieldset(variantProps);

	const hasHelperText = Boolean(helperText);
	const hasErrorText = Boolean(errorText);
	// Passing an errorText without an explicit invalid flag still means the
	// fieldset is invalid — Fieldset has no validator of its own, so this is
	// the only signal it gets.
	const invalid = invalidProp ?? hasErrorText;

	const contextValue: FieldsetContextValue = {
		id,
		disabled,
		invalid,
		required,
		helperTextId: `fieldset::${id}::helper-text`,
		errorTextId: `fieldset::${id}::error-text`,
	};

	const describedBy = [
		hasHelperText ? contextValue.helperTextId : null,
		invalid && hasErrorText ? contextValue.errorTextId : null,
	]
		.filter(Boolean)
		.join(" ");

	return (
		<FieldsetContext.Provider value={contextValue}>
			<fieldset
				id={id}
				class={cx(styles.root, classProp)}
				disabled={disabled}
				aria-describedby={describedBy || undefined}
				aria-invalid={invalid ? "true" : undefined}
				data-invalid={invalid ? "" : undefined}
				data-disabled={disabled ? "" : undefined}
				data-required={required ? "" : undefined}
				{...restProps}
			>
				{/* The <legend> must stay a direct child of <fieldset> — that's
				the only place browsers use it to compute the group's
				accessible name, so it can't live inside FieldsetContent. */}
				{legend && <FieldsetLegend>{legend}</FieldsetLegend>}
				{hasHelperText && <FieldsetHelperText>{helperText}</FieldsetHelperText>}
				{children && <FieldsetControl>{children}</FieldsetControl>}
				{invalid && hasErrorText && (
					<FieldsetErrorText>{errorText}</FieldsetErrorText>
				)}
			</fieldset>
		</FieldsetContext.Provider>
	);
}

function FieldsetLegend(props: PropsWithChildren<{ class?: string }>) {
	const context = useFieldsetContext();
	const styles = fieldset();
	return (
		<legend
			class={cx(styles.legend, props.class)}
			data-disabled={context?.disabled ? "" : undefined}
			data-invalid={context?.invalid ? "" : undefined}
			data-required={context?.required ? "" : undefined}
		>
			{props.children}
			{context?.required && <FieldsetRequiredIndicator />}
		</legend>
	);
}

function FieldsetHelperText(
	props: PropsWithChildren<{
		class?: string;
	}>,
) {
	const context = useFieldsetContext();
	const styles = fieldset();
	return (
		<p
			id={context?.helperTextId}
			class={cx(styles.helperText, props.class)}
			data-disabled={context?.disabled ? "" : undefined}
			data-invalid={context?.invalid ? "" : undefined}
			data-required={context?.required ? "" : undefined}
		>
			{props.children}
		</p>
	);
}

function FieldsetErrorText(props: PropsWithChildren<{ class?: string }>) {
	const context = useFieldsetContext();
	const styles = fieldset();
	if (!context?.invalid) return null;
	return (
		<p
			id={context?.errorTextId}
			aria-live="polite"
			class={cx(styles.errorText, props.class)}
			data-disabled={context?.disabled ? "" : undefined}
			data-invalid={context?.invalid ? "" : undefined}
			data-required={context?.required ? "" : undefined}
		>
			{props.children}
		</p>
	);
}

function FieldsetRequiredIndicator(props: {
	children?: Child;
	class?: string;
}) {
	const styles = fieldset();
	return (
		<span aria-hidden="true" class={cx(styles.requiredIndicator, props.class)}>
			{props.children || "*"}
		</span>
	);
}

function FieldsetContent(
	props: PropsWithChildren<{
		class?: string;
		[key: string]: unknown;
	}>,
) {
	const { children, class: classProp, ...restProps } = props;
	const styles = fieldset();
	return (
		<div class={cx(styles.content, classProp)} {...restProps}>
			{children}
		</div>
	);
}

function FieldsetControl(
	props: PropsWithChildren<{
		class?: string;
		[key: string]: unknown;
	}>,
) {
	const { children, class: classProp, ...restProps } = props;
	const styles = fieldset();
	return (
		<div class={cx(styles.control, classProp)} {...restProps}>
			{children}
		</div>
	);
}

export {
	Fieldset,
	FieldsetContent,
	FieldsetControl,
	FieldsetErrorText,
	FieldsetHelperText,
	FieldsetLegend,
	type FieldsetProps,
	FieldsetRequiredIndicator,
};
export default Fieldset;
