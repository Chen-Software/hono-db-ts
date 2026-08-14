import { type JSX, useId } from "hono/jsx";
import { CloseIcon } from "../../icons/close";
import PopoverIsland from "../../islands/popover";
import { IconButton } from "./button";
import { shouldHydrate } from "./island-utils";
import {
	Anchor,
	Arrow,
	ArrowTip,
	Body,
	CloseTrigger,
	Content,
	Context,
	Description,
	Footer,
	Header,
	Indicator,
	type InteractivePopoverProps,
	Positioner,
	Root as RootPrimitive,
	RootProvider,
	Title,
	Trigger,
} from "./popover-primitive";

interface PopoverProps extends InteractivePopoverProps {
	interactive?: boolean; // keep — forces island hydration (default true)
	trigger?: JSX.Element; // rendered asChild inside PopoverTrigger
	showArrow?: boolean; // render Arrow + ArrowTip (default true)
	title?: string | JSX.Element;
	description?: string | JSX.Element;
	body?: string | JSX.Element;
	footer?: string | JSX.Element;
	closable?: boolean; // render CloseTrigger (default true)
	closeIcon?: JSX.Element; // custom close icon; defaults to built-in X
	children?: JSX.Element; // extra content, rendered alongside `body` inside the padded Body slot
}

function Root(props: PopoverProps) {
	const { interactive, ...rest } = props;

	if (shouldHydrate(interactive, true)) {
		return <PopoverIsland {...rest} />;
	}

	return <RootPrimitive {...rest} />;
}

function Popover(props: PopoverProps) {
	const {
		interactive,
		trigger,
		showArrow = true,
		title,
		description,
		body,
		footer,
		closable = true,
		closeIcon,
		children,
		id,
		placement,
		...rest
	} = props;
	const autoId = useId();
	// Threaded explicitly to Trigger/Content/Title/Positioner/Arrow (instead
	// of leaving them to derive it from PopoverContext) because HonoX
	// reconstructs an island's `children` for hydration from a context-less
	// snapshot — context-derived id/aria-*/placement wiring would silently
	// disappear (or reset to its default) once the client hydrates, while an
	// explicit prop survives.
	const resolvedId = id || autoId;

	return (
		<Root
			{...rest}
			id={resolvedId}
			placement={placement}
			interactive={interactive}
		>
			{trigger && (
				<Trigger id={resolvedId} asChild>
					{trigger}
				</Trigger>
			)}
			<Positioner placement={placement}>
				<Content id={resolvedId}>
					{showArrow && (
						<Arrow placement={placement}>
							<ArrowTip placement={placement} />
						</Arrow>
					)}
					{closable && (
						<CloseTrigger asChild>
							<IconButton variant="plain" size="sm" aria-label="Close">
								{closeIcon ?? <CloseIcon width="20" height="20" />}
							</IconButton>
						</CloseTrigger>
					)}
					{(title || description) && (
						<Header>
							{title && <Title id={resolvedId}>{title}</Title>}
							{description && (
								<Description id={resolvedId}>{description}</Description>
							)}
						</Header>
					)}
					{(body || children) && (
						<Body>
							{body}
							{children}
						</Body>
					)}
					{footer && <Footer>{footer}</Footer>}
				</Content>
			</Positioner>
		</Root>
	);
}

const PopoverComponent = Object.assign(Popover, {
	Root,
	RootProvider,
	Anchor,
	Trigger,
	Positioner,
	Arrow,
	ArrowTip,
	Content,
	CloseTrigger,
	Header,
	Body,
	Footer,
	Title,
	Description,
	Indicator,
	Context,
});

export {
	Anchor,
	Arrow,
	ArrowTip,
	Body,
	CloseTrigger,
	Content,
	Context,
	Description,
	Footer,
	Header,
	Indicator,
	PopoverComponent as Popover,
	type PopoverProps,
	Positioner,
	Root,
	RootProvider,
	Title,
	Trigger,
};

export default PopoverComponent;
