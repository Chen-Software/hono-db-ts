import CheckboxIsland from "../../islands/checkbox";
import {
	type CheckboxProps as BaseCheckboxProps,
	Checkbox as CheckboxPrimitive,
} from "./checkbox-primitive";
import { shouldHydrate } from "./island-utils";

export interface CheckboxProps extends BaseCheckboxProps {
	interactive?: boolean;
	defaultChecked?: boolean | "indeterminate";
}

export function Checkbox(props: CheckboxProps) {
	const { interactive, onCheckedChange, checked, defaultChecked } = props;

	const hasSignal =
		onCheckedChange !== undefined ||
		checked !== undefined ||
		defaultChecked !== undefined;
	const isInteractive = shouldHydrate(interactive, hasSignal);

	if (isInteractive) {
		return <CheckboxIsland {...props} />;
	}

	return <CheckboxPrimitive {...props} />;
}
