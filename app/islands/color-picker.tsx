import {
	InteractiveColorPicker,
	type InteractiveColorPickerProps,
} from "../components/ui/color-picker-primitive";

export default function ColorPickerIsland(props: InteractiveColorPickerProps) {
	return <InteractiveColorPicker {...props} />;
}

export type { InteractiveColorPickerProps as ColorPickerIslandProps };
