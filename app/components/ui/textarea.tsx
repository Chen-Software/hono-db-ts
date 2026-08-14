import TextareaIsland from "../../islands/textarea";
import { shouldHydrate } from "./island-utils";
import {
	type TextareaProps as BaseTextareaProps,
	Textarea as TextareaPrimitive,
} from "./textarea-primitive";

export interface TextareaProps extends BaseTextareaProps {
	interactive?: boolean;
	defaultValue?: string;
}

export function Textarea(props: TextareaProps) {
	const {
		interactive,
		onValueChange,
		value,
		defaultValue,
		validator,
		minLength,
	} = props;

	const hasSignal =
		onValueChange !== undefined ||
		value !== undefined ||
		defaultValue !== undefined ||
		validator !== undefined ||
		minLength !== undefined;
	const isInteractive = shouldHydrate(interactive, hasSignal);

	if (isInteractive) {
		// Function props don't survive island hydration (they're dropped by
		// JSON.stringify), so also send the validator across as source text —
		// FieldRoot falls back to reconstructing it from `validatorSource`
		// once `validator` itself has been stripped on the client.
		return (
			<TextareaIsland
				{...props}
				validatorSource={
					typeof validator === "function" ? validator.toString() : validator
				}
			/>
		);
	}

	return <TextareaPrimitive {...props} />;
}
