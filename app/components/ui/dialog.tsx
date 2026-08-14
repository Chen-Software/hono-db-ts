import type { JSX } from "hono/jsx";
import { CloseIcon } from "../../icons/close";
import DialogIsland from "../../islands/dialog";
import { IconButton } from "./button";
import {
	ActionTrigger,
	Backdrop,
	Body,
	CloseTrigger,
	Content,
	Description,
	Root as DialogPrimitiveRoot,
	type RootProps as DialogPrimitiveRootProps,
	Footer,
	Header,
	Positioner,
	Title,
	Trigger,
} from "./dialog-primitive";
import { shouldHydrate } from "./island-utils";

interface RootProps extends DialogPrimitiveRootProps {
	interactive?: boolean;
	/** Close when Escape is pressed. Default: true. */
	closeOnEscape?: boolean;
	/** Close when the backdrop is clicked / interaction occurs outside. Default: true. */
	closeOnInteractOutside?: boolean;
	/** Lock body scroll while open. Default: true. */
	preventScroll?: boolean;
	/** Trap Tab/Shift+Tab focus cycling within the content. Default: true. */
	trapFocus?: boolean;
	/** Element to focus when the dialog opens. Defaults to the first focusable. */
	initialFocusEl?: () => HTMLElement | null;
	/** Element to focus when the dialog closes. Defaults to the trigger. */
	finalFocusEl?: () => HTMLElement | null;
	/** Fired on Escape keydown, before the close-on-escape default runs. Call `event.preventDefault()` to suppress the default close. */
	onEscapeKeyDown?: (event: KeyboardEvent) => void;
	/** Fired on an outside backdrop interaction, before the close-on-interact-outside default runs. Call `event.preventDefault()` to suppress the default close. */
	onInteractOutside?: (event: Event) => void;
	/** Fired once the close (exit) animation has fully finished. */
	onExitComplete?: () => void;
}

function Root(props: RootProps) {
	const { interactive, ...rest } = props;
	if (shouldHydrate(interactive, true)) {
		return <DialogIsland {...rest} />;
	}
	return <DialogPrimitiveRoot {...rest} />;
}

export type { RootProps };

export interface DialogProps extends RootProps {
	trigger?: JSX.Element;
	title?: string | JSX.Element;
	description?: string | JSX.Element;
	body?: string | JSX.Element;
	footer?: string | JSX.Element;
	cancel?: JSX.Element;
	confirm?: JSX.Element;
	closable?: boolean;
	/** Dialog variant: a standard modal or an alert dialog. Default: "dialog". */
	role?: "dialog" | "alertdialog";
	/** Accessible name for the dialog when no `title` is provided. */
	"aria-label"?: string;
	/** Close when Escape is pressed. Default: true. */
	closeOnEscape?: boolean;
	/** Close when the backdrop is clicked / interaction occurs outside. Default: true. */
	closeOnInteractOutside?: boolean;
	/** Element to focus when the dialog opens. Defaults to the first focusable. */
	initialFocusEl?: () => HTMLElement | null;
	/** Element to focus when the dialog closes. Defaults to the trigger. */
	finalFocusEl?: () => HTMLElement | null;
}

function Dialog(props: DialogProps) {
	const {
		trigger,
		title,
		description,
		body,
		footer,
		cancel,
		confirm,
		closable = true,
		children,
		rootRef,
		role,
		"aria-label": ariaLabel,
		...rest
	} = props;

	// Dev aid: a dialog must have an accessible name (WAI-ARIA). The Content
	// component already warns client-side when neither `title` nor `aria-label`
	// resolves to one, so we don't duplicate that warning here.

	return (
		<Root {...rest} rootRef={rootRef} dialogRole={role}>
			{trigger && <Trigger asChild>{trigger}</Trigger>}
			<Backdrop />
			<Positioner>
				<Content aria-label={ariaLabel}>
					{closable && (
						<CloseTrigger asChild>
							<IconButton variant="plain" size="sm" aria-label="Close">
								<CloseIcon />
							</IconButton>
						</CloseTrigger>
					)}
					<Header>
						{title && <Title>{title}</Title>}
						{description && <Description>{description}</Description>}
					</Header>
					{body && <Body>{body}</Body>}
					{children}
					{(footer || cancel || confirm) && (
						<Footer>
							{cancel && (
								<CloseTrigger asChild unstyled>
									{cancel}
								</CloseTrigger>
							)}
							{confirm && <ActionTrigger asChild>{confirm}</ActionTrigger>}
							{footer}
						</Footer>
					)}
				</Content>
			</Positioner>
		</Root>
	);
}

const DialogComponent = Object.assign(Dialog, {
	Root,
	Trigger,
	Backdrop,
	Positioner,
	Content,
	Header,
	Body,
	Footer,
	Title,
	Description,
	CloseTrigger,
	ActionTrigger,
});

export {
	ActionTrigger,
	Backdrop,
	Body,
	CloseTrigger,
	Content,
	DialogComponent as Dialog,
	Footer,
	Header,
	Positioner,
	Title,
	Trigger,
};

export default DialogComponent;
