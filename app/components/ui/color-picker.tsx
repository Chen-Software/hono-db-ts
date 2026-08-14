/**
 * ColorPicker — hono/jsx styled wrapper.
 *
 * Renders the static primitive when there is no interactive signal, otherwise
 * hydrates the island (InteractiveColorPicker) for pointer/keyboard control.
 */
import type { JSX } from "hono/jsx";
import ColorPickerIsland from "../../islands/color-picker";
import {
	Area,
	AreaBackground,
	AreaThumb,
	ChannelInput,
	ChannelSlider,
	ChannelSliderLabel,
	ChannelSliderThumb,
	ChannelSliderTrack,
	ChannelSliderValueText,
	type ColorFormat,
	type ColorPickerChangeDetails,
	ColorPickerContent,
	Root as ColorPickerPrimitiveRoot,
	type ColorPickerVariantProps,
	Content,
	Control,
	EyeDropperTrigger,
	FormatSelect,
	FormatTrigger,
	HiddenInput,
	type HSVA,
	Label,
	Positioner,
	Swatch,
	SwatchGroup,
	SwatchIndicator,
	SwatchTrigger,
	TransparencyGrid,
	Trigger,
	ValueSwatch,
	ValueText,
	View,
} from "./color-picker-primitive";
import { shouldHydrate } from "./island-utils";

interface ColorPickerProps extends ColorPickerVariantProps {
	value?: string | HSVA;
	defaultValue?: string | HSVA;
	format?: ColorFormat;
	defaultFormat?: ColorFormat;
	onValueChange?: (details: ColorPickerChangeDetails) => void;
	onFormatChange?: (details: { format: ColorFormat }) => void;
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (details: { open: boolean }) => void;
	closeOnSelect?: boolean;
	presets?: string[];
	name?: string;
	disabled?: boolean;
	readOnly?: boolean;
	/** Render a swatch trigger that opens the picker in a popover. */
	trigger?: boolean;
	label?: string | JSX.Element;
	showArea?: boolean;
	showSliders?: boolean;
	showInputs?: boolean;
	showSwatches?: boolean;
	/** Force static HTML (false) or always-hydrated island (true). */
	interactive?: boolean;
	class?: string;
	id?: string;
	disabledAlpha?: boolean;
	allowClear?: boolean;
	onClear?: () => void;
	showText?: boolean;
	onChange?: (details: ColorPickerChangeDetails) => void;
	onChangeComplete?: (details: ColorPickerChangeDetails) => void;
}

function ColorPickerRoot(props: ColorPickerProps) {
	const {
		label,
		value,
		defaultValue,
		format,
		defaultFormat,
		onValueChange,
		onFormatChange,
		open,
		defaultOpen,
		onOpenChange,
		closeOnSelect,
		presets,
		name,
		disabled,
		readOnly,
		trigger,
		showArea,
		showSliders,
		showInputs,
		showSwatches,
		interactive,
		class: classProp,
		id,
		disabledAlpha,
		allowClear,
		onClear,
		showText,
		onChange,
		onChangeComplete,
		...rest
	} = props;

	const hasSignal =
		onValueChange !== undefined ||
		onFormatChange !== undefined ||
		onOpenChange !== undefined ||
		value !== undefined ||
		defaultValue !== undefined ||
		open !== undefined ||
		defaultOpen !== undefined ||
		trigger === true ||
		onChange !== undefined ||
		onChangeComplete !== undefined;
	const isInteractive = shouldHydrate(interactive, hasSignal);

	if (isInteractive) {
		return (
			<ColorPickerIsland
				{...rest}
				value={value}
				defaultValue={defaultValue}
				format={format}
				defaultFormat={defaultFormat}
				onValueChange={onValueChange}
				onFormatChange={onFormatChange}
				open={open}
				defaultOpen={defaultOpen}
				onOpenChange={onOpenChange}
				closeOnSelect={closeOnSelect}
				presets={presets}
				name={name}
				disabled={disabled}
				readOnly={readOnly}
				trigger={trigger}
				label={label}
				showArea={showArea}
				showSliders={showSliders}
				showInputs={showInputs}
				showSwatches={showSwatches}
				id={id}
				class={classProp}
				disabledAlpha={disabledAlpha}
				allowClear={allowClear}
				onClear={onClear}
				showText={showText}
				onChange={onChange}
				onChangeComplete={onChangeComplete}
			/>
		);
	}

	return (
		<ColorPickerPrimitiveRoot
			{...rest}
			value={value}
			defaultValue={defaultValue}
			format={format ?? defaultFormat}
			disabled={disabled}
			readOnly={readOnly}
			id={id}
			class={classProp}
			disabledAlpha={disabledAlpha}
		>
			{label && <Label>{label}</Label>}
			<ColorPickerContent
				presets={presets}
				name={name}
				interactive={false}
				showArea={showArea}
				showSliders={showSliders}
				showInputs={showInputs}
				showSwatches={showSwatches}
				disabledAlpha={disabledAlpha}
				allowClear={allowClear}
				onClear={onClear}
			/>
		</ColorPickerPrimitiveRoot>
	);
}

const ColorPicker = Object.assign(ColorPickerRoot, {
	Root: ColorPickerPrimitiveRoot,
	Label,
	Control,
	Area,
	AreaBackground,
	AreaThumb,
	ChannelInput,
	ChannelSlider,
	ChannelSliderLabel,
	ChannelSliderTrack,
	ChannelSliderThumb,
	ChannelSliderValueText,
	Content,
	SwatchGroup,
	Swatch,
	SwatchIndicator,
	SwatchTrigger,
	TransparencyGrid,
	Trigger,
	Positioner,
	FormatSelect,
	FormatTrigger,
	ValueSwatch,
	ValueText,
	View,
	EyeDropperTrigger,
	HiddenInput,
});

export { ColorPicker, type ColorPickerProps };
export default ColorPicker;
