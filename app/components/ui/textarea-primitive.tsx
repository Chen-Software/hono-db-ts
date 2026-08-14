import { cx } from "design-system/css";
import type { TextareaVariantProps } from "design-system/recipes";
import { textarea } from "design-system/recipes";
import {
	FieldRoot,
	useFieldContext,
	type ValidatorFn,
} from "./field-primitive";

export interface TextareaPrimitiveProps extends TextareaVariantProps {
	children?: any;
	class?: string;
	value?: string;
	onValueChange?: (value: string) => void;
	onInput?: (e: any) => void;
	[key: string]: any;
}

export function TextareaPrimitive(props: TextareaPrimitiveProps) {
	const field = useFieldContext();
	const [variantProps, localProps] = textarea.splitVariantProps(props);
	const {
		class: classProp,
		value: valueProp,
		onInput,
		onValueChange,
		...restProps
	} = localProps;
	const styles = textarea(variantProps);

	const describedBy = [];
	if (field?.hasHelperText) describedBy.push(field.helperTextId);
	if (field?.invalid && field?.hasErrorText)
		describedBy.push(field.errorTextId);

	const value = valueProp !== undefined ? valueProp : field?.value;

	const handleInput = (e: any) => {
		if (onInput) onInput(e);
		const newValue = e.target.value;
		if (onValueChange) onValueChange(newValue);
		if (field?.onValueChange) {
			field.onValueChange(newValue);
		}
	};

	return (
		<textarea
			id={field?.id}
			aria-describedby={
				describedBy.length > 0 ? describedBy.join(" ") : undefined
			}
			aria-invalid={field?.invalid ? "true" : undefined}
			aria-required={field?.required ? "true" : undefined}
			disabled={field?.disabled}
			readOnly={field?.readOnly}
			class={cx(styles, classProp)}
			value={value}
			onInput={handleInput}
			{...(restProps as any)}
		/>
	);
}

export interface TextareaProps extends TextareaPrimitiveProps {
	label?: string;
	helperText?: string;
	errorText?: string;
	validator?: ValidatorFn | string;
	validatorSource?: string;
	minLength?: number;
}

export function Textarea(props: TextareaProps) {
	const {
		label,
		helperText,
		errorText,
		validator,
		validatorSource,
		minLength,
		class: className,
		id,
		disabled,
		invalid,
		readOnly,
		required,
		value,
		onValueChange,
		...rest
	} = props;

	return (
		<FieldRoot
			id={id}
			disabled={disabled}
			invalid={invalid}
			readOnly={readOnly}
			required={required}
			value={value}
			onValueChange={onValueChange}
			validator={validator}
			validatorSource={validatorSource}
			minLength={minLength}
			class={className}
			label={label}
			helperText={helperText}
			errorText={errorText}
		>
			<TextareaPrimitive {...rest} />
		</FieldRoot>
	);
}
