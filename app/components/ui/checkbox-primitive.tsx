import { cx } from "design-system/css";
import type { CheckboxVariantProps } from "design-system/recipes";
import { checkbox } from "design-system/recipes";
import type { Child } from "hono/jsx";
import type { ColorPalette } from "./color-palette";
import { colorPaletteClass } from "./color-palette";
import { useFieldContext } from "./field-primitive";

export interface CheckboxProps extends CheckboxVariantProps {
	children?: Child;
	class?: string;
	checked?: boolean | "indeterminate";
	onCheckedChange?: (details: { checked: boolean | "indeterminate" }) => void;
	disabled?: boolean;
	invalid?: boolean;
	required?: boolean;
	readOnly?: boolean;
	id?: string;
	name?: string;
	value?: string;
	colorPalette?: ColorPalette;
	ref?: any;
	[key: string]: unknown;
}

export function Checkbox(props: CheckboxProps) {
	const field = useFieldContext();
	const [variantProps, localProps] = checkbox.splitVariantProps(props);
	const {
		children,
		class: classProp,
		checked,
		onCheckedChange,
		disabled = field?.disabled,
		invalid = field?.invalid,
		required = field?.required,
		readOnly = field?.readOnly,
		id = field?.id,
		name,
		value = "on",
		colorPalette,
		ref,
		...restProps
	} = localProps;

	const handleChange = (e: Event) => {
		const target = e.target as HTMLInputElement;
		onCheckedChange?.({ checked: target.checked });
	};

	const styles = checkbox(variantProps);

	const isChecked = checked === true;
	const isIndeterminate = checked === "indeterminate";

	const describedBy = [];
	if (field?.hasHelperText) describedBy.push(field.helperTextId);
	if (field?.invalid && field?.hasErrorText)
		describedBy.push(field.errorTextId);

	const dataState = isIndeterminate
		? "indeterminate"
		: isChecked
			? "checked"
			: "unchecked";

	return (
		<label
			class={cx(
				styles.root,
				colorPaletteClass(colorPalette as string | undefined),
				classProp as string | undefined,
			)}
			for={id}
			data-disabled={disabled ? "" : undefined}
			data-invalid={invalid ? "" : undefined}
			data-readonly={readOnly ? "" : undefined}
			data-required={required ? "" : undefined}
			data-state={dataState}
			{...restProps}
		>
			<input
				ref={ref}
				type="checkbox"
				style={{
					border: "0",
					clip: "rect(0 0 0 0)",
					height: "1px",
					margin: "-1px",
					overflow: "hidden",
					padding: "0",
					position: "absolute",
					width: "1px",
					whiteSpace: "nowrap",
				}}
				name={name}
				value={value}
				checked={isChecked}
				onChange={handleChange}
				disabled={disabled}
				readOnly={readOnly}
				required={required}
				id={id}
				aria-readonly={readOnly ? "true" : undefined}
				aria-invalid={invalid ? "true" : undefined}
				aria-required={required ? "true" : undefined}
				aria-checked={isIndeterminate ? "mixed" : isChecked ? "true" : "false"}
				aria-describedby={
					describedBy.length > 0 ? describedBy.join(" ") : undefined
				}
				data-state={dataState}
			/>
			<div
				class={styles.control}
				data-disabled={disabled ? "" : undefined}
				data-invalid={invalid ? "" : undefined}
				data-readonly={readOnly ? "" : undefined}
				data-state={dataState}
			>
				{(isChecked || isIndeterminate) && (
					<div class={styles.indicator}>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="3px"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<title>{isIndeterminate ? "Indeterminate" : "Checked"}</title>
							{isIndeterminate ? (
								<path d="M5 12h14" />
							) : (
								<path d="M20 6 9 17l-5-5" />
							)}
						</svg>
					</div>
				)}
			</div>
			{children && (
				<span
					class={styles.label}
					data-disabled={disabled ? "" : undefined}
					data-invalid={invalid ? "" : undefined}
					data-readonly={readOnly ? "" : undefined}
					data-state={dataState}
				>
					{children}
				</span>
			)}
		</label>
	);
}
