import SelectIsland from "../../islands/select";
import { shouldHydrate } from "./island-utils";
import {
	ClearTrigger,
	Content,
	Control,
	ErrorText,
	HelperText,
	HiddenSelect,
	Indicator,
	IndicatorGroup,
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
	type SelectFlattenedProps,
	SelectStructure,
	Trigger,
	ValueText,
} from "./select-primitive";

export interface SelectProps extends SelectFlattenedProps {
	interactive?: boolean;
}

export function SelectRoot(props: SelectProps) {
	const { interactive, ...rest } = props;

	// The Select component forces hydration by default using shouldHydrate(interactive, true)
	const isInteractive = shouldHydrate(interactive, true);

	if (isInteractive) {
		return <SelectIsland {...rest} />;
	}

	const selectedValues = rest.selectedValues ?? rest.defaultValue;

	return (
		<Root {...rest} selectedValues={selectedValues}>
			<SelectStructure {...rest} />
		</Root>
	);
}

export const Select = Object.assign(SelectRoot, {
	Root,
	Label,
	Control,
	Trigger,
	ValueText,
	Indicator,
	IndicatorGroup,
	Positioner,
	Content,
	List,
	Item,
	ItemText,
	ItemIndicator,
	ItemGroup,
	ItemGroupLabel,
	ClearTrigger,
	HiddenSelect,
	RequiredIndicator,
	HelperText,
	ErrorText,
});

export {
	ClearTrigger,
	Content,
	Control,
	ErrorText,
	HelperText,
	HiddenSelect,
	Indicator,
	IndicatorGroup,
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
	Trigger,
	ValueText,
};

export default Select;
