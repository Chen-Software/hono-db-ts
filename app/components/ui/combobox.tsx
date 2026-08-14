import ComboboxIsland from "../../islands/combobox";
import {
	ClearTrigger,
	type ComboboxFlattenedProps,
	Root as ComboboxPrimitiveRoot,
	ComboboxStructure,
	Content,
	Context,
	Control,
	Empty,
	ErrorText,
	HelperText,
	IndicatorGroup,
	Input,
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
	RootProvider,
	Trigger,
} from "./combobox-primitive";
import { shouldHydrate } from "./island-utils";

export interface ComboboxProps extends ComboboxFlattenedProps {
	interactive?: boolean;
}

export function ComboboxRoot(props: ComboboxProps) {
	const { interactive, ...rest } = props;

	const hasSignal =
		rest.open !== undefined ||
		rest.inputValue !== undefined ||
		rest.onToggle !== undefined ||
		rest.onInputChange !== undefined ||
		rest.onItemSelect !== undefined ||
		rest.multiple !== undefined;
	const isInteractive = shouldHydrate(interactive, hasSignal);

	if (isInteractive) {
		return <ComboboxIsland {...rest} />;
	}

	return (
		<ComboboxPrimitiveRoot {...rest}>
			<ComboboxStructure {...rest} />
		</ComboboxPrimitiveRoot>
	);
}

export const Combobox = Object.assign(ComboboxRoot, {
	Root,
	RootProvider,
	Label,
	Control,
	Input,
	Trigger,
	ClearTrigger,
	Positioner,
	Content,
	List,
	Item,
	ItemText,
	ItemIndicator,
	ItemGroup,
	ItemGroupLabel,
	Empty,
	IndicatorGroup,
	Context,
	RequiredIndicator,
	HelperText,
	ErrorText,
});

export {
	ClearTrigger,
	Content,
	Context,
	Control,
	Empty,
	ErrorText,
	HelperText,
	IndicatorGroup,
	Input,
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
	RootProvider,
	Trigger,
};

export default Combobox;
