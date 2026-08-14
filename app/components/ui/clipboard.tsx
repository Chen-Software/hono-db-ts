import type { JSX } from "hono/jsx";
import { CheckIcon } from "../../icons/check";
import { CopyIcon } from "../../icons/copy";
import ClipboardIsland from "../../islands/clipboard";
import {
	Context,
	Control,
	CopyText,
	Indicator,
	Input,
	Label,
	Root as RootPrimitive,
	type RootProps,
	RootProvider,
	Trigger,
} from "./clipboard-primitive";
import { shouldHydrate } from "./island-utils";

export interface ClipboardProps extends RootProps {
	interactive?: boolean; // keep — forces island hydration (default true)
	label?: JSX.Element | string;
	children?: JSX.Element; // custom Trigger content; defaults to copy/check icons
}

const DefaultCopyIcon = () => <CopyIcon width="16" height="16" />;

const DefaultCheckIcon = () => <CheckIcon width="16" height="16" />;

function Root(props: ClipboardProps) {
	const { interactive, ...rest } = props;

	if (shouldHydrate(interactive, true)) {
		return <ClipboardIsland {...rest} />;
	}

	return <RootPrimitive {...rest} />;
}

function Clipboard(props: ClipboardProps) {
	const { interactive, label, children, ...rest } = props;

	return (
		<Root {...rest} interactive={interactive}>
			{label && <Label>{label}</Label>}
			<Control>
				<Input />
				<Trigger>
					{children ?? (
						<Indicator copied={<DefaultCheckIcon />}>
							<DefaultCopyIcon />
						</Indicator>
					)}
				</Trigger>
			</Control>
		</Root>
	);
}

const ClipboardComponent = Object.assign(Clipboard, {
	Root,
	RootProvider,
	Label,
	Control,
	Input,
	Trigger,
	Indicator,
	CopyText,
	Context,
});

export {
	ClipboardComponent as Clipboard,
	type ClipboardProps,
	Context,
	Control,
	CopyText,
	Indicator,
	Input,
	Label,
	Root,
	RootProvider,
	Trigger,
};

export default ClipboardComponent;
