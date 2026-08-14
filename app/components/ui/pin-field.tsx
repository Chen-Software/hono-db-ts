import PinFieldIsland from "../../islands/pin-field";
import { shouldHydrate } from "./island-utils";
import * as Primitives from "./pin-field-primitive";

export interface PinFieldProps extends Primitives.RootProps {
	/**
	 * Whether to enable interactivity (hydration).
	 * - `true`  → always hydrate (explicit opt-in)
	 * - `false` → never hydrate, render pure static markup (explicit opt-out)
	 * - omitted → conditional: hydrate iff a behavioural signal is present
	 *   (a handler, controlled state, or uncontrolled initial value)
	 */
	interactive?: boolean;
}

/**
 * A highly production-ready pin/OTP field ported to Hono/JSX, following the
 * same label + helper text + error text + validator conventions as Field.
 */
export function PinField(props: PinFieldProps) {
	const {
		value,
		defaultValue,
		onValueChange,
		onValueComplete,
		onValueInvalid,
		interactive,
		validator,
		autoSubmit,
		onAutoSubmit,
		...rest
	} = props;

	// Tier-2 conditional: hydrate when any behavioural signal is present —
	// an event handler, controlled state, or uncontrolled initial value. An
	// explicit `interactive` knob overrides this: `true` forces, `false` forbids.
	const hasSignal =
		onValueChange !== undefined ||
		onValueComplete !== undefined ||
		onValueInvalid !== undefined ||
		value !== undefined ||
		defaultValue !== undefined ||
		validator !== undefined ||
		autoSubmit !== undefined ||
		onAutoSubmit !== undefined;

	if (shouldHydrate(interactive, hasSignal)) {
		// Function props don't survive island hydration (they're dropped by
		// JSON.stringify), so also send the validator across as source text —
		// Root falls back to reconstructing it from `validatorSource` once
		// `validator` itself has been stripped on the client.
		return (
			<PinFieldIsland
				value={value}
				defaultValue={defaultValue}
				onValueChange={onValueChange}
				onValueComplete={onValueComplete}
				onValueInvalid={onValueInvalid}
				validator={validator}
				validatorSource={
					typeof validator === "function" ? validator.toString() : validator
				}
				autoSubmit={autoSubmit}
				onAutoSubmit={onAutoSubmit}
				{...rest}
			/>
		);
	}

	return (
		<Primitives.Root
			value={value}
			defaultValue={defaultValue}
			validator={validator}
			{...rest}
		/>
	);
}

export const Root = Primitives.Root;
export const Label = Primitives.Label;
export const Control = Primitives.Control;
export const Input = Primitives.Input;
export const Inputs = Primitives.Inputs;
export const HiddenInput = Primitives.HiddenInput;
export const HelperText = Primitives.HelperText;
export const ErrorText = Primitives.ErrorText;

Object.assign(PinField, {
	Root: Primitives.Root,
	Label: Primitives.Label,
	Control: Primitives.Control,
	Input: Primitives.Input,
	Inputs: Primitives.Inputs,
	HiddenInput: Primitives.HiddenInput,
	HelperText: Primitives.HelperText,
	ErrorText: Primitives.ErrorText,
});
