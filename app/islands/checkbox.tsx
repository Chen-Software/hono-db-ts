import { useEffect, useRef, useState } from "hono/jsx";
import {
	Checkbox,
	type CheckboxProps,
} from "../components/ui/checkbox-primitive";

export interface InteractiveCheckboxProps extends CheckboxProps {
	defaultChecked?: boolean | "indeterminate";
}

export function InteractiveCheckbox(props: InteractiveCheckboxProps) {
	const {
		checked: checkedProp,
		defaultChecked,
		onCheckedChange,
		...rest
	} = props;

	const [isChecked, setIsChecked] = useState(
		checkedProp ?? defaultChecked ?? false,
	);
	const isControlled = checkedProp !== undefined;
	const checked = isControlled ? checkedProp : isChecked;

	const handleCheckedChange = (details: {
		checked: boolean | "indeterminate";
	}) => {
		if (!isControlled) {
			setIsChecked(details.checked);
		}
		onCheckedChange?.(details);
	};

	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (inputRef.current) {
			inputRef.current.indeterminate = checked === "indeterminate";
		}
	}, [checked]);

	return (
		<Checkbox
			{...rest}
			checked={checked}
			onCheckedChange={handleCheckedChange}
			ref={inputRef}
		/>
	);
}

export default function CheckboxIsland(props: InteractiveCheckboxProps) {
	return <InteractiveCheckbox {...props} />;
}

export type { InteractiveCheckboxProps as CheckboxIslandProps };
