import { useState } from "hono/jsx";
import {
	Textarea,
	type TextareaProps,
} from "../components/ui/textarea-primitive";

export function InteractiveTextarea(props: TextareaProps) {
	const { value: valueProp, defaultValue = "", onValueChange, ...rest } = props;
	const [value, setValue] = useState(valueProp ?? defaultValue);
	const isControlled = valueProp !== undefined;
	const currentValue = isControlled ? valueProp : value;

	const handleValueChange = (val: string) => {
		if (!isControlled) {
			setValue(val);
		}
		onValueChange?.(val);
	};

	return (
		<Textarea
			{...rest}
			value={currentValue}
			onValueChange={handleValueChange}
		/>
	);
}

export default function TextareaIsland(props: TextareaProps) {
	return <InteractiveTextarea {...props} />;
}

export type { TextareaProps as TextareaIslandProps };
