import TagsFieldIsland from "../../islands/tags-field";
import { shouldHydrate } from "./island-utils";
import * as Primitives from "./tags-field-primitive";

export interface TagsFieldProps extends Primitives.RootProps {
	/**
	 * Whether to enable interactivity (hydration).
	 * - `true`  → always hydrate (explicit opt-in)
	 * - `false` → never hydrate, render pure static markup (explicit opt-out)
	 * - omitted → conditional: hydrate iff a behavioural signal is present
	 *   (a handler, controlled state, or uncontrolled initial value)
	 */
	interactive?: boolean;
	onValueChange?: (details: { value: string[] }) => void;
	onInputValueChange?: (details: { inputValue: string }) => void;
}

export function TagsField(props: TagsFieldProps) {
	const {
		value,
		defaultValue,
		onValueChange,
		inputValue,
		defaultInputValue,
		onInputValueChange,
		interactive,
		children,
		...rest
	} = props;

	// Tier-2 conditional: hydrate when any behavioural signal is present —
	// an event handler, controlled state (value / inputValue), or uncontrolled
	// initial state (defaultValue / defaultInputValue). An explicit `interactive`
	// knob overrides this: `true` forces, `false` forbids.
	const hasSignal =
		onValueChange !== undefined ||
		onInputValueChange !== undefined ||
		value !== undefined ||
		inputValue !== undefined ||
		defaultValue !== undefined ||
		defaultInputValue !== undefined;

	if (shouldHydrate(interactive, hasSignal)) {
		return (
			<TagsFieldIsland
				value={value}
				defaultValue={defaultValue}
				onValueChange={onValueChange}
				inputValue={inputValue}
				defaultInputValue={defaultInputValue}
				onInputValueChange={onInputValueChange}
				{...rest}
			>
				{children}
			</TagsFieldIsland>
		);
	}

	return (
		<Primitives.Root
			value={value}
			defaultValue={defaultValue}
			inputValue={inputValue}
			defaultInputValue={defaultInputValue}
			{...rest}
		>
			{children}
		</Primitives.Root>
	);
}

export const Root = Primitives.Root;
export const Label = Primitives.Label;
export const Control = Primitives.Control;
export const Input = Primitives.Input;
export const Item = Primitives.Item;
export const ItemPreview = Primitives.ItemPreview;
export const ItemText = Primitives.ItemText;
export const ItemInput = Primitives.ItemInput;
export const ItemDeleteTrigger = Primitives.ItemDeleteTrigger;
export const ClearTrigger = Primitives.ClearTrigger;
export const HiddenInput = Primitives.HiddenInput;
export const Items = Primitives.Items;
export const HelperText = Primitives.HelperText;
export const ErrorText = Primitives.ErrorText;

Object.assign(TagsField, {
	Root: Primitives.Root,
	Label: Primitives.Label,
	Control: Primitives.Control,
	Input: Primitives.Input,
	Item: Primitives.Item,
	ItemPreview: Primitives.ItemPreview,
	ItemText: Primitives.ItemText,
	ItemInput: Primitives.ItemInput,
	ItemDeleteTrigger: Primitives.ItemDeleteTrigger,
	ClearTrigger: Primitives.ClearTrigger,
	HiddenInput: Primitives.HiddenInput,
	Items: Primitives.Items,
	HelperText: Primitives.HelperText,
	ErrorText: Primitives.ErrorText,
});
