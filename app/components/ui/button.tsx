import { CloseIcon } from "../../icons/close";
import ButtonIsland from "../../islands/button";
import {
	ButtonGroup as ButtonGroupPrimitive,
	type ButtonGroupProps,
	Button as ButtonPrimitive,
	type ButtonProps,
} from "./button-primitive";
import { shouldHydrate } from "./island-utils";

/** True when the button carries a client-side handler that needs hydration. */
const hasButtonSignal = (p: ButtonProps): boolean =>
	p.onClick !== undefined ||
	p.onPointerDown !== undefined ||
	p.onSubmit !== undefined;

export function IconButton(props: ButtonProps) {
	if (shouldHydrate(props.interactive, hasButtonSignal(props))) {
		return <ButtonIsland {...props} px="0" />;
	}
	return (
		<ButtonPrimitive px="0" {...props}>
			{props.children}
		</ButtonPrimitive>
	);
}

export function CloseButton(props: ButtonProps) {
	if (shouldHydrate(props.interactive, hasButtonSignal(props))) {
		return (
			<ButtonIsland variant="plain" aria-label="Close" {...props} px="0">
				<CloseIcon />
			</ButtonIsland>
		);
	}
	return (
		<ButtonPrimitive variant="plain" aria-label="Close" {...props} px="0">
			<CloseIcon />
		</ButtonPrimitive>
	);
}

export function Button(props: ButtonProps) {
	if (shouldHydrate(props.interactive, hasButtonSignal(props))) {
		return <ButtonIsland {...props} />;
	}
	return <ButtonPrimitive {...props} />;
}

export function ButtonGroup(props: ButtonGroupProps) {
	return <ButtonGroupPrimitive {...props} />;
}

export type { ButtonGroupProps, ButtonProps };
