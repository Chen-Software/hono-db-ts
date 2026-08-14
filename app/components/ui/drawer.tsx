import { cx } from "design-system/css";
import { drawer } from "design-system/recipes";
import type { JSX } from "hono/jsx";
import { CloseIcon } from "../../icons/close";
import DrawerIsland from "../../islands/drawer";
import { IconButton } from "./button";
import {
	ActionTrigger,
	Backdrop,
	Body,
	CloseTrigger,
	Content,
	Description,
	Root as DrawerPrimitiveRoot,
	type RootProps as DrawerPrimitiveRootProps,
	Footer,
	Header,
	Positioner,
	Title,
	Trigger,
} from "./drawer-primitive";
import { shouldHydrate } from "./island-utils";

interface RootProps extends DrawerPrimitiveRootProps {
	interactive?: boolean;
}

function Root(props: RootProps) {
	const { interactive, ...rest } = props;
	if (shouldHydrate(interactive, true)) {
		return <DrawerIsland {...rest} />;
	}
	return <DrawerPrimitiveRoot {...rest} />;
}

export interface DrawerProps extends RootProps {
	trigger?: JSX.Element;
	title?: string | JSX.Element;
	description?: string | JSX.Element;
	body?: string | JSX.Element;
	footer?: string | JSX.Element;
	cancel?: JSX.Element;
	confirm?: JSX.Element;
	closable?: boolean;
	/** Extra class merged onto the `content` part — e.g. to widen a drawer
	 * beyond its `size` variant's max-width. See the note above `Drawer()`
	 * on why this has to be a literal class rather than a bigger `size`. */
	contentClass?: string;
	/** Drawer variant: a standard panel or an alert dialog. Default: "dialog". */
	role?: "dialog" | "alertdialog";
	/** Accessible name for the drawer when no `title` is provided. */
	"aria-label"?: string;
	/** Close when Escape is pressed. Default: true. */
	closeOnEscape?: boolean;
	/** Close when the backdrop is clicked / interaction occurs outside. Default: true. */
	closeOnInteractOutside?: boolean;
	/** Element to focus when the drawer opens. Defaults to the first focusable. */
	initialFocusEl?: () => HTMLElement | null;
	/** Element to focus when the drawer closes. Defaults to the trigger. */
	finalFocusEl?: () => HTMLElement | null;
}

function Drawer(props: DrawerProps) {
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
		contentClass,
		...rest
	} = props;

	// Computed here, in the plain (non-island) wrapper, and threaded down as
	// literal `class` props rather than left for Positioner/Content/Body/
	// Footer to read off DrawerContext themselves. HonoX renders an island's
	// `children` a second time — outside the DrawerContext.Provider that
	// `Root` sets up inside the island — to capture the snapshot it uses for
	// client hydration, so any non-default `size`/`placement` variant read
	// via context there silently resets to the recipe's defaults the moment
	// the client takes over (see honox-drawer-island-placement-hydration-bug
	// in project memory). A literal prop baked into these elements before
	// they ever cross the island boundary can't diverge between that pass
	// and the real one, since both render the exact same vnode object.
	const [variantProps] = drawer.splitVariantProps(props);
	const styles = drawer(variantProps);

	return (
		<Root {...rest} rootRef={rootRef} dialogRole={role}>
			{trigger && <Trigger asChild>{trigger}</Trigger>}
			<Backdrop />
			<Positioner class={styles.positioner}>
				<Content
					aria-label={ariaLabel}
					class={cx(styles.content, contentClass)}
				>
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
					{body && <Body class={styles.body}>{body}</Body>}
					{children}
					{(footer || cancel || confirm) && (
						<Footer class={styles.footer}>
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

const DrawerComponent = Object.assign(Drawer, {
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
	DrawerComponent as Drawer,
	Footer,
	Header,
	Positioner,
	Title,
	Trigger,
};

export default DrawerComponent;
