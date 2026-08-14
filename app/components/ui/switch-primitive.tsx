import { cx } from "design-system/css";
import type { SwitchRecipeVariantProps } from "design-system/recipes";
import { switchRecipe } from "design-system/recipes";
import type { Child } from "hono/jsx";
import type { ColorPalette } from "./color-palette";
import { colorPaletteClass } from "./color-palette";
import { useFieldContext } from "./field-primitive";

export interface SwitchProps extends SwitchRecipeVariantProps {
	children?: Child;
	class?: string;
	colorPalette?: ColorPalette;
	checked?: boolean;
	disabled?: boolean;
	invalid?: boolean;
	required?: boolean;
	readOnly?: boolean;
	name?: string;
	value?: string;
	onCheckedChange?: (details: { checked: boolean }) => void;
	id?: string;
	[key: string]: unknown;
}

export function Switch(props: SwitchProps) {
	const field = useFieldContext();
	const [variantProps, localProps] = switchRecipe.splitVariantProps(props);
	const {
		children,
		class: classProp,
		checked,
		disabled: disabledProp = field?.disabled,
		invalid: invalidProp = field?.invalid,
		required: requiredProp = field?.required,
		readOnly: readOnlyProp = field?.readOnly,
		name,
		value = "on",
		onCheckedChange,
		id: idProp = field?.id,
		colorPalette,
		...restProps
	} = localProps;

	const styles = switchRecipe(variantProps);

	const labelId = `switch::${idProp}::label`;

	const describedBy = [];
	if (field?.hasHelperText) describedBy.push(field.helperTextId);
	if (field?.invalid && field?.hasErrorText)
		describedBy.push(field.errorTextId);

	return (
		<label
			class={cx(
				styles.root,
				colorPaletteClass(colorPalette as string | undefined),
				classProp as string | undefined,
			)}
			data-disabled={disabledProp ? "" : undefined}
			data-invalid={invalidProp ? "" : undefined}
			data-readonly={readOnlyProp ? "" : undefined}
			data-required={requiredProp ? "" : undefined}
			data-state={checked ? "checked" : "unchecked"}
			{...restProps}
		>
			<input
				class="peer"
				type="checkbox"
				role="switch"
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
				checked={checked}
				disabled={disabledProp}
				readOnly={readOnlyProp}
				required={requiredProp}
				id={idProp}
				aria-readonly={readOnlyProp ? "true" : undefined}
				aria-invalid={invalidProp ? "true" : undefined}
				aria-required={requiredProp ? "true" : undefined}
				aria-checked={checked ? "true" : "false"}
				aria-labelledby={children ? labelId : undefined}
				aria-describedby={
					describedBy.length > 0 ? describedBy.join(" ") : undefined
				}
				onClick={(e) => {
					// The HTML `readonly` attribute has no effect on checkboxes, so the
					// click must be cancelled manually to actually block toggling.
					if (readOnlyProp) e.preventDefault();
				}}
				onKeyDown={(e) => {
					// Native checkboxes only toggle on Space; Ark UI's switch also
					// toggles on Enter, so replicate that here.
					if (readOnlyProp || e.key !== "Enter") return;
					e.preventDefault();
					if (e.target instanceof HTMLInputElement) {
						const nextChecked = !e.target.checked;
						e.target.checked = nextChecked;
						onCheckedChange?.({ checked: nextChecked });
					}
				}}
				onChange={(e) => {
					if (readOnlyProp) return;
					if (e.target instanceof HTMLInputElement) {
						onCheckedChange?.({ checked: e.target.checked });
					}
				}}
				data-state={checked ? "checked" : "unchecked"}
			/>
			<div
				class={styles.control}
				data-disabled={disabledProp ? "" : undefined}
				data-invalid={invalidProp ? "" : undefined}
				data-readonly={readOnlyProp ? "" : undefined}
				data-state={checked ? "checked" : "unchecked"}
			>
				<div
					class={styles.thumb}
					data-disabled={disabledProp ? "" : undefined}
					data-invalid={invalidProp ? "" : undefined}
					data-readonly={readOnlyProp ? "" : undefined}
					data-state={checked ? "checked" : "unchecked"}
				/>
			</div>
			{children && (
				<span
					id={labelId}
					class={styles.label}
					data-disabled={disabledProp ? "" : undefined}
					data-invalid={invalidProp ? "" : undefined}
					data-readonly={readOnlyProp ? "" : undefined}
					data-state={checked ? "checked" : "unchecked"}
				>
					{children}
				</span>
			)}
		</label>
	);
}
