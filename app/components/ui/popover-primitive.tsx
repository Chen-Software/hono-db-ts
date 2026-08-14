import { css, cx } from "design-system/css";
import { popover } from "design-system/recipes";
import {
	cloneElement,
	createContext,
	type PropsWithChildren,
	useContext,
	useEffect,
	useId,
	useRef,
	useState,
} from "hono/jsx";
import {
	getFocusable,
	hasPart,
	useOverlayStackEntry,
	whenAnimationEnds,
} from "./overlay-a11y";
import {
	getArrowRotation,
	getArrowStyle,
	getPlacementStyle,
	type OverlayPlacement,
	ownedBy,
	positionOverlay,
} from "./overlay-position";

type PopoverPlacement = OverlayPlacement;

const ARROW_OFFSET = "16px";
const PLACEMENT_CONFIG = { align: "start", arrowOffset: ARROW_OFFSET } as const;

type PopoverStyles = ReturnType<typeof popover>;

interface PopoverContextValue {
	id: string;
	open: boolean;
	styles: PopoverStyles;
	placement: PopoverPlacement;
	onClose?: () => void;
	onToggle?: () => void;
}

interface PopoverRootProps extends PropsWithChildren {
	id?: string;
	open?: boolean;
	onClose?: () => void;
	onToggle?: () => void;
	/** Which side of the trigger the content opens on. Default: "bottom". */
	placement?: PopoverPlacement;
	/** Close when Escape is pressed. Default: true. */
	closeOnEscape?: boolean;
	/** Close when interaction occurs outside the popover. Default: true. */
	closeOnInteractOutside?: boolean;
}

interface PopoverTriggerProps extends PropsWithChildren {
	class?: string;
	asChild?: boolean;
	[key: string]: unknown;
}

interface PopoverPositionerProps extends PropsWithChildren {
	class?: string;
	placement?: PopoverPlacement;
	[key: string]: unknown;
}

interface PopoverContentProps extends PropsWithChildren {
	class?: string;
	[key: string]: unknown;
}

interface PopoverTitleProps extends PropsWithChildren {
	class?: string;
	id?: string;
}

interface PopoverDescriptionProps extends PropsWithChildren {
	class?: string;
	id?: string;
}

interface PopoverCloseTriggerProps extends PropsWithChildren {
	class?: string;
	asChild?: boolean;
}

interface PopoverAnchorProps extends PropsWithChildren {
	class?: string;
	asChild?: boolean;
	[key: string]: unknown;
}

interface PopoverIndicatorProps extends PropsWithChildren {
	class?: string;
	asChild?: boolean;
	[key: string]: unknown;
}

interface InteractivePopoverProps extends PopoverRootProps {
	defaultOpen?: boolean;
	onOpenChange?: (details: { open: boolean }) => void;
}

const PopoverContext = createContext<PopoverContextValue | null>(null);

const usePopoverContext = () => {
	const context = useContext(PopoverContext);
	return context;
};

function Root(props: PopoverRootProps) {
	const {
		id: idProp,
		open = false,
		placement = "bottom",
		children,
		onClose,
		onToggle,
	} = props;
	const autoId = useId();
	const id = idProp || autoId;
	const styles = popover();

	return (
		<PopoverContext.Provider
			value={{ id, open, styles, placement, onClose, onToggle }}
		>
			{children}
		</PopoverContext.Provider>
	);
}

function RootProvider(props: PopoverRootProps) {
	return <Root {...props} />;
}

function Anchor(props: PopoverAnchorProps) {
	const { children, class: classProp, asChild, ...restProps } = props;
	const context = usePopoverContext();
	const styles = context?.styles || popover();

	const anchorProps = {
		"data-scope": "popover",
		"data-part": "anchor",
		...restProps,
	};

	if (asChild && typeof children === "object" && children !== null) {
		const child = children as {
			props?: { class?: string; [key: string]: unknown };
		};
		return cloneElement(child as any, {
			...anchorProps,
			class: cx(styles.anchor, classProp, child.props?.class),
		});
	}

	return (
		<div class={cx(styles.anchor, classProp)} {...anchorProps}>
			{children}
		</div>
	);
}

function Trigger(props: PopoverTriggerProps) {
	const {
		children,
		class: classProp,
		asChild,
		id: idProp,
		...restProps
	} = props;
	const context = usePopoverContext();
	// An explicit `id` prop (threaded from the non-island composer) takes
	// priority over context — see the note on `PopoverProps`'s `id` handling
	// in popover.tsx for why context-derived ids don't survive hydration.
	const id = (idProp as string | undefined) || context?.id;
	const open = context?.open;
	const styles = context?.styles || popover();

	const triggerProps = {
		id: id ? `popover-trigger-${id}` : undefined,
		"aria-haspopup": "dialog",
		"aria-expanded": open ? "true" : "false",
		"aria-controls": open && id ? `popover-content-${id}` : undefined,
		"data-state": open ? "open" : "closed",
		"data-scope": "popover",
		"data-part": "trigger",
		...restProps,
	};

	if (asChild && typeof children === "object" && children !== null) {
		const child = children as {
			type?: unknown;
			props?: { class?: string; [key: string]: unknown };
		};
		const isNativeControl = child.type === "button" || child.type === "a";
		const customTriggerProps: Record<string, unknown> = {
			...triggerProps,
			class: cx(styles.trigger, classProp, child.props?.class),
		};

		if (!isNativeControl) {
			customTriggerProps.tabIndex = child.props?.tabIndex ?? 0;
			customTriggerProps.role = child.props?.role ?? "button";

			const existingKeyDown = child.props?.onKeyDown as
				| ((e: KeyboardEvent) => void)
				| undefined;
			customTriggerProps.onKeyDown = (e: KeyboardEvent) => {
				if (e.key === " " || e.key === "Enter") {
					e.preventDefault();
					const element = e.currentTarget as HTMLElement | null;
					element?.click();
				}
				existingKeyDown?.(e);
			};
		}

		return cloneElement(child as any, customTriggerProps);
	}

	return (
		<button
			type="button"
			class={cx(styles.trigger, classProp)}
			{...triggerProps}
		>
			{children}
		</button>
	);
}

function Positioner(props: PopoverPositionerProps) {
	const {
		children,
		class: classProp,
		placement: placementProp,
		...restProps
	} = props;
	const context = usePopoverContext();
	const open = context?.open;
	const styles = context?.styles || popover();
	// An explicit `placement` prop (threaded from the non-island composer)
	// takes priority over context — see the note on `Trigger`'s `id` handling
	// for why context-derived values don't survive hydration.
	const placement = placementProp ?? context?.placement ?? "bottom";

	return (
		<div
			class={cx(
				styles.positioner,
				classProp,
				!open && css({ display: "none" }),
			)}
			data-state={open ? "open" : "closed"}
			data-scope="popover"
			data-part="positioner"
			data-placement={placement}
			style={{
				position: "absolute",
				zIndex: "calc(var(--z-index-popover) + var(--layer-index, 0))",
				...getPlacementStyle(placement, PLACEMENT_CONFIG),
			}}
			{...restProps}
		>
			{children}
		</div>
	);
}

function Content(props: PopoverContentProps) {
	const { children, class: classProp, id: idProp, ...restProps } = props;
	const context = usePopoverContext();
	const id = (idProp as string | undefined) || context?.id;
	const open = context?.open;
	const styles = context?.styles || popover();

	const titleId = id ? `popover-title-${id}` : undefined;
	const descriptionId = id ? `popover-description-${id}` : undefined;
	const titleRendered = hasPart(children, Title);
	const hasDescription = hasPart(children, Description);

	return (
		<div
			id={id ? `popover-content-${id}` : undefined}
			role="dialog"
			data-scope="popover"
			data-part="content"
			{...(titleRendered ? { "aria-labelledby": titleId } : {})}
			{...(hasDescription ? { "aria-describedby": descriptionId } : {})}
			class={cx(styles.content, classProp)}
			data-state={open ? "open" : "closed"}
			tabIndex={-1}
			{...restProps}
		>
			{children}
		</div>
	);
}

function Header(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...restProps } = props;
	const context = usePopoverContext();
	const styles = context?.styles || popover();
	return (
		<header
			class={cx(styles.header, classProp)}
			data-scope="popover"
			data-part="header"
			{...restProps}
		>
			{children}
		</header>
	);
}

function Body(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...restProps } = props;
	const context = usePopoverContext();
	const styles = context?.styles || popover();
	return (
		<div
			class={cx(styles.body, classProp)}
			data-scope="popover"
			data-part="body"
			{...restProps}
		>
			{children}
		</div>
	);
}

function Footer(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...restProps } = props;
	const context = usePopoverContext();
	const styles = context?.styles || popover();
	return (
		<footer
			class={cx(styles.footer, classProp)}
			data-scope="popover"
			data-part="footer"
			{...restProps}
		>
			{children}
		</footer>
	);
}

function Title(props: PopoverTitleProps) {
	const { children, class: classProp, id: idProp, ...restProps } = props;
	const context = usePopoverContext();
	const id = idProp || context?.id;
	const styles = context?.styles || popover();
	return (
		<h2
			id={id ? `popover-title-${id}` : undefined}
			class={cx(styles.title, classProp)}
			data-scope="popover"
			data-part="title"
			{...restProps}
		>
			{children}
		</h2>
	);
}

function Description(props: PopoverDescriptionProps) {
	const { children, class: classProp, id: idProp, ...restProps } = props;
	const context = usePopoverContext();
	const id = idProp || context?.id;
	const styles = context?.styles || popover();
	return (
		<p
			id={id ? `popover-description-${id}` : undefined}
			class={cx(styles.description, classProp)}
			data-scope="popover"
			data-part="description"
			{...restProps}
		>
			{children}
		</p>
	);
}

function CloseTrigger(props: PopoverCloseTriggerProps) {
	const { children, class: classProp, asChild, ...restProps } = props;
	const context = usePopoverContext();
	const styles = context?.styles || popover();

	const triggerProps = {
		"aria-label": "Close",
		"data-scope": "popover",
		"data-part": "close-trigger",
		...restProps,
	};

	if (asChild && typeof children === "object" && children !== null) {
		const child = children as {
			props?: { class?: string; [key: string]: unknown };
		};
		return cloneElement(child as any, {
			...triggerProps,
			class: cx(styles.closeTrigger, classProp, child.props?.class),
		});
	}

	return (
		<button
			type="button"
			class={cx(styles.closeTrigger, classProp)}
			{...triggerProps}
		>
			{children}
		</button>
	);
}

function Arrow(
	props: PropsWithChildren<{ class?: string; placement?: PopoverPlacement }>,
) {
	const {
		children,
		class: classProp,
		placement: placementProp,
		...restProps
	} = props;
	const context = usePopoverContext();
	const styles = context?.styles || popover();
	const placement = placementProp ?? context?.placement ?? "bottom";
	return (
		<div
			class={cx(styles.arrow, classProp)}
			data-scope="popover"
			data-part="arrow"
			style={getArrowStyle(placement, PLACEMENT_CONFIG)}
			{...restProps}
		>
			{children}
		</div>
	);
}

function ArrowTip(props: { class?: string; placement?: PopoverPlacement }) {
	const { class: classProp, placement: placementProp, ...restProps } = props;
	const context = usePopoverContext();
	const styles = context?.styles || popover();
	const placement = placementProp ?? context?.placement ?? "bottom";
	return (
		<div
			class={cx(styles.arrowTip, classProp)}
			data-scope="popover"
			data-part="arrow-tip"
			style={{ transform: `rotate(${getArrowRotation(placement)}deg)` }}
			{...restProps}
		/>
	);
}

function Indicator(props: PopoverIndicatorProps) {
	const { children, class: classProp, asChild, ...restProps } = props;
	const context = usePopoverContext();
	const styles = context?.styles || popover();
	const open = context?.open;

	const indicatorProps = {
		"data-scope": "popover",
		"data-part": "indicator",
		"data-state": open ? "open" : "closed",
		...restProps,
	};

	if (asChild && typeof children === "object" && children !== null) {
		const child = children as {
			props?: { class?: string; [key: string]: unknown };
		};
		return cloneElement(child as any, {
			...indicatorProps,
			class: cx(styles.indicator, classProp, child.props?.class),
		});
	}

	return (
		<div class={cx(styles.indicator, classProp)} {...indicatorProps}>
			{children}
		</div>
	);
}

function Context(props: {
	children: (context: PopoverContextValue | null) => unknown;
}) {
	const context = usePopoverContext();
	return props.children(context) as any;
}

function InteractivePopoverRoot(props: InteractivePopoverProps) {
	const {
		open: openProp,
		children,
		id: idProp,
		closeOnEscape = true,
		closeOnInteractOutside = true,
		defaultOpen,
		onOpenChange,
		...rest
	} = props;
	const [isOpen, setIsOpen] = useState(openProp ?? defaultOpen ?? false);
	const isControlled = openProp !== undefined;
	const open = isControlled ? openProp : isOpen;

	const fallbackId = useId();
	const rootId = idProp || `popover-${fallbackId}`;

	// Lets an ancestor Dialog/Drawer's Escape/Tab handling know this Popover
	// is the topmost open overlay while it's open (see useOverlayStackEntry).
	useOverlayStackEntry(rootId, open);

	const handleOpenChangeRef = useRef<(nextOpen: boolean) => void>(() => {});
	const closeOnEscapeRef = useRef(closeOnEscape);
	closeOnEscapeRef.current = closeOnEscape;
	const closeOnInteractOutsideRef = useRef(closeOnInteractOutside);
	closeOnInteractOutsideRef.current = closeOnInteractOutside;
	const prevFocusRef = useRef<HTMLElement | null>(null);
	const isFirstRender = useRef(true);

	const [renderOpen, setRenderOpen] = useState(open);

	useEffect(() => {
		if (open) {
			setRenderOpen(true);
		} else {
			const root = document.getElementById(rootId);
			if (root && renderOpen) {
				const contentEl = root.querySelector(
					'[data-part="content"]',
				) as HTMLElement | null;
				const positionerEl = root.querySelector(
					'[data-part="positioner"]',
				) as HTMLElement | null;
				const animatedEl = contentEl || positionerEl;
				if (animatedEl) {
					const cleanup = whenAnimationEnds(animatedEl, () => {
						setRenderOpen(false);
					});
					return cleanup;
				}
			}
			setRenderOpen(false);
		}
	}, [open, renderOpen, rootId]);

	const handleOpenChange = (nextOpen: boolean) => {
		if (!isControlled) {
			setIsOpen(nextOpen);
		}
		onOpenChange?.({ open: nextOpen });
	};

	useEffect(() => {
		handleOpenChangeRef.current = handleOpenChange;
	}, [isControlled, onOpenChange]);

	const showRef = useRef<() => void>(() => {});
	const hideRef = useRef<(shouldFocus?: boolean) => void>(() => {});

	// Sync the `open` prop/state into the DOM. Runs on every open/close,
	// whether triggered by a click inside the mount effect below or by a
	// controlled parent flipping the `open` prop directly.
	useEffect(() => {
		if (open) {
			showRef.current?.();
		} else {
			hideRef.current?.(!isFirstRender.current);
		}
		isFirstRender.current = false;
	}, [open]);

	// Single mount effect: defines show/hide once (assigned to the refs above)
	// and wires up click delegation, outside-dismiss, and Escape.
	useEffect(() => {
		if (typeof document === "undefined") {
			return;
		}

		const root = document.getElementById(rootId);
		if (!root) {
			return;
		}

		const isCurrentlyOpen = () => root.getAttribute("data-state") === "open";
		let cancelPendingHide = () => {};

		const show = () => {
			cancelPendingHide();
			if (isCurrentlyOpen()) return;
			prevFocusRef.current = document.activeElement as HTMLElement | null;
			root.setAttribute("data-state", "open");
			const positioners = ownedBy<HTMLElement>(
				root,
				'[data-part="positioner"]',
			);
			positioners.forEach((p) => {
				p.style.setProperty("display", "block", "important");
				p.setAttribute("data-state", "open");
			});
			positionOverlay(root, PLACEMENT_CONFIG);
			const content = ownedBy<HTMLElement>(root, '[data-part="content"]')[0];
			if (content) {
				content.setAttribute("data-state", "open");
				const focusable = getFocusable(content);
				(focusable[0] ?? content).focus();
			}
			const trigger = ownedBy<HTMLElement>(root, '[data-part="trigger"]')[0];
			if (trigger) {
				trigger.setAttribute("data-state", "open");
				trigger.setAttribute("aria-expanded", "true");
			}
			const indicators = ownedBy<HTMLElement>(root, '[data-part="indicator"]');
			indicators.forEach((i) => {
				i.setAttribute("data-state", "open");
			});
		};

		// Defers `display: none` on the positioner until the `_closed`
		// (scale-fade-out) animation actually finishes, so it gets a chance
		// to play instead of being cut off by an instant hide.
		const hide = (shouldFocus = true) => {
			if (!isCurrentlyOpen()) return;
			root.setAttribute("data-state", "closed");
			const positioners = ownedBy<HTMLElement>(
				root,
				'[data-part="positioner"]',
			);
			const content = ownedBy<HTMLElement>(root, '[data-part="content"]')[0];
			positioners.forEach((p) => {
				p.setAttribute("data-state", "closed");
			});
			if (content) {
				content.setAttribute("data-state", "closed");
			}
			const trigger = ownedBy<HTMLElement>(root, '[data-part="trigger"]')[0];
			if (trigger) {
				trigger.setAttribute("data-state", "closed");
				trigger.setAttribute("aria-expanded", "false");
			}
			const indicators = ownedBy<HTMLElement>(root, '[data-part="indicator"]');
			indicators.forEach((i) => {
				i.setAttribute("data-state", "closed");
			});
			if (shouldFocus) {
				(trigger ?? prevFocusRef.current)?.focus();
			}

			cancelPendingHide();
			const animatedEl = content ?? positioners[0];
			if (animatedEl) {
				cancelPendingHide = whenAnimationEnds(animatedEl, () => {
					if (!isCurrentlyOpen()) {
						positioners.forEach((p) => {
							p.style.setProperty("display", "none", "important");
						});
					}
				});
			} else {
				positioners.forEach((p) => {
					p.style.setProperty("display", "none", "important");
				});
			}
		};

		showRef.current = show;
		hideRef.current = hide;

		if (open) {
			show();
		}

		const handleClick = (e: Event) => {
			const target = (e.target as HTMLElement).closest(
				"[data-part]",
			) as HTMLElement;
			if (!target) return;
			// A click inside a nested overlay (e.g. a Dropdown/Select trigger
			// rendered within this popover's content) belongs to that nested
			// overlay's own root — ignore it here so it isn't double-handled.
			// `data-overlay-root` is the generic marker every overlay primitive
			// sets (Popover included), not just `data-popover-root`, so this also
			// catches non-Popover overlays nested inside a Popover.
			const owner = target.closest("[data-overlay-root]");
			if (owner && owner !== root) return;
			const dataPart = target.getAttribute("data-part");

			if (dataPart === "trigger") {
				const nextOpen = !isCurrentlyOpen();
				if (nextOpen) {
					show();
				} else {
					hide();
				}
				handleOpenChangeRef.current?.(nextOpen);
			} else if (dataPart === "close-trigger") {
				hide();
				handleOpenChangeRef.current?.(false);
			}
		};

		const handleDocumentPointerDown = (e: Event) => {
			if (!isCurrentlyOpen() || !closeOnInteractOutsideRef.current) return;
			if (root.contains(e.target as Node)) return;
			hide();
			handleOpenChangeRef.current?.(false);
		};

		// Keyboard "light dismiss": tabbing away from the popover onto
		// something outside it closes it, mirroring the pointer-based
		// outside-dismiss above for keyboard-only users.
		const handleFocusOut = (e: FocusEvent) => {
			if (!isCurrentlyOpen() || !closeOnInteractOutsideRef.current) return;
			const next = e.relatedTarget as Node | null;
			if (next && root.contains(next)) return;
			hide();
			handleOpenChangeRef.current?.(false);
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			if (!isCurrentlyOpen() || e.key !== "Escape" || !closeOnEscapeRef.current)
				return;
			e.preventDefault();
			hide();
			handleOpenChangeRef.current?.(false);
		};

		const handleResize = () => {
			if (isCurrentlyOpen()) {
				positionOverlay(root, PLACEMENT_CONFIG);
			}
		};

		const handleScroll = () => {
			if (isCurrentlyOpen()) {
				positionOverlay(root, PLACEMENT_CONFIG);
			}
		};

		root.addEventListener("click", handleClick);
		root.addEventListener("focusout", handleFocusOut);
		document.addEventListener("mousedown", handleDocumentPointerDown);
		document.addEventListener("keydown", handleKeyDown);
		window.addEventListener("resize", handleResize);
		window.addEventListener("scroll", handleScroll, true);

		return () => {
			cancelPendingHide();
			root.removeEventListener("click", handleClick);
			root.removeEventListener("focusout", handleFocusOut);
			document.removeEventListener("mousedown", handleDocumentPointerDown);
			document.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("resize", handleResize);
			window.removeEventListener("scroll", handleScroll, true);
		};
	}, [rootId]);

	return (
		<div
			id={rootId}
			data-popover-root
			data-overlay-root
			data-state={open ? "open" : "closed"}
			style={{ position: "relative", display: "inline-block" }}
		>
			<Root id={idProp} {...rest} open={renderOpen}>
				{children}
			</Root>
		</div>
	);
}

export type {
	InteractivePopoverProps,
	PopoverAnchorProps,
	PopoverCloseTriggerProps,
	PopoverContentProps,
	PopoverContextValue,
	PopoverDescriptionProps,
	PopoverIndicatorProps,
	PopoverPlacement,
	PopoverPositionerProps,
	PopoverRootProps,
	PopoverStyles,
	PopoverTitleProps,
	PopoverTriggerProps,
};
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
	InteractivePopoverRoot,
	Positioner,
	Root,
	RootProvider,
	Title,
	Trigger,
};
