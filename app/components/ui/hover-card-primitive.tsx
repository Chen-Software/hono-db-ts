import { css, cx } from "design-system/css";
import { hoverCard } from "design-system/recipes";
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
import { hasOpenNested } from "./overlay-a11y";
import {
	getArrowRotation,
	getArrowStyle,
	getPlacementStyle,
	type OverlayPlacement,
	positionOverlay,
} from "./overlay-position";

export type HoverCardPlacement = OverlayPlacement;

// HoverCard content is typically richer/wider than its trigger (title +
// description + actions), so — like Popover — it hangs its leading edge off
// the trigger's leading edge rather than centering (Tooltip's convention,
// reserved for narrow single-line content). `pointAtCenter` keeps the arrow
// itself locked to the trigger's actual midpoint (measured from the real DOM
// rect whenever the card opens or the viewport resizes — see
// InteractiveHoverCardRoot) regardless of the trigger's width, and
// `positionOverlay`'s own viewport clamping pulls the whole box back on
// screen near a viewport edge. Together these replace the old hand-rolled
// `align="start"|"end"` prop this component used to have — there's no longer
// a manual escape hatch to reach for near a viewport edge.
const ARROW_OFFSET = "16px";
const PLACEMENT_CONFIG = {
	align: "start",
	arrowOffset: ARROW_OFFSET,
	pointAtCenter: true,
} as const;

type HoverCardStyles = ReturnType<typeof hoverCard>;

export interface HoverCardContextValue {
	id: string;
	open: boolean;
	styles: HoverCardStyles;
	lazyMount?: boolean;
	unmountOnExit?: boolean;
	hasOpenedRef?: { current: boolean };
	placement: HoverCardPlacement;
	disabled?: boolean;
}

const HoverCardContext = createContext<HoverCardContextValue | null>(null);

export const useHoverCardContext = () => {
	const context = useContext(HoverCardContext);
	return context;
};

export interface HoverCardRootProps extends PropsWithChildren {
	id?: string;
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (details: { open: boolean }) => void;
	openDelay?: number;
	closeDelay?: number;
	lazyMount?: boolean;
	unmountOnExit?: boolean;
	/** Which side of the trigger the card opens on. Default: "bottom". */
	placement?: HoverCardPlacement;
	/** Prevents the card from opening via hover, focus, or tap. Default: false. */
	disabled?: boolean;
}

export function Root(props: HoverCardRootProps) {
	const {
		id: idProp,
		open = false,
		children,
		lazyMount,
		unmountOnExit,
		placement = "bottom",
		disabled = false,
	} = props;
	const autoId = useId();
	const id = idProp || autoId;
	const styles = hoverCard();
	const hasOpenedRef = useRef(open);
	if (open) {
		hasOpenedRef.current = true;
	}

	return (
		<HoverCardContext.Provider
			value={{
				id,
				open,
				styles,
				lazyMount,
				unmountOnExit,
				hasOpenedRef,
				placement,
				disabled,
			}}
		>
			{children}
		</HoverCardContext.Provider>
	);
}

export function RootProvider(props: HoverCardRootProps) {
	return <Root {...props} />;
}

export interface HoverCardTriggerProps extends PropsWithChildren {
	class?: string;
	asChild?: boolean;
	[key: string]: unknown;
}

export function Trigger(props: HoverCardTriggerProps) {
	const { children, class: classProp, asChild, ...restProps } = props;
	const context = useHoverCardContext();
	const id = context?.id;
	const open = context?.open;
	const styles = context?.styles || hoverCard();
	const disabled = context?.disabled;

	const triggerProps = {
		id: id ? `hover-card-trigger-${id}` : undefined,
		"aria-haspopup": "dialog",
		"aria-expanded": open ? "true" : "false",
		"aria-controls": open && id ? `hover-card-content-${id}` : undefined,
		"aria-disabled": disabled ? "true" : undefined,
		"data-state": open ? "open" : "closed",
		"data-scope": "hover-card",
		"data-part": "trigger",
		...restProps,
	};

	if (asChild && typeof children === "object" && children !== null) {
		const child = children as {
			// hono/jsx's JSXNode carries the tag on `.tag`, not `.type` (unlike
			// React) — checking `.type` here would silently always be
			// `undefined` and treat every child, native or not, as non-native.
			// `.tag` is a plain string ("button") in real SSR output, but can
			// come through as a named function in some jsx-runtime resolutions
			// (observed under bun:test) — normalise both to be safe.
			tag?: unknown;
			props?: { class?: string; tabIndex?: unknown; role?: unknown };
		};
		const tagName =
			typeof child.tag === "function" ? child.tag.name : child.tag;
		const isNativeControl = tagName === "button" || tagName === "a";
		const customTriggerProps: Record<string, unknown> = {
			...triggerProps,
			class: cx(styles.trigger, classProp, child.props?.class),
		};

		// A native <button>/<a> child is already focusable and keeps its own
		// click semantics untouched (important — it may be a real link, e.g.
		// an @mention, that should still navigate on click/tap). A non-native
		// child (an Avatar <div>, an icon, styled text) gets no keyboard
		// affordance for free, so patch one in — without it, focus can never
		// reach the trigger at all and the card becomes mouse-only.
		if (!isNativeControl) {
			customTriggerProps.tabIndex = child.props?.tabIndex ?? 0;
			customTriggerProps.role = child.props?.role ?? "button";
		}

		return cloneElement(child as any, customTriggerProps);
	}

	return (
		<div
			class={cx(styles.trigger, classProp)}
			tabIndex={0}
			role="button"
			{...triggerProps}
		>
			{children}
		</div>
	);
}

export interface HoverCardPositionerProps extends PropsWithChildren {
	class?: string;
	placement?: HoverCardPlacement;
	[key: string]: unknown;
}

export function Positioner(props: HoverCardPositionerProps) {
	const {
		children,
		class: classProp,
		placement: placementProp,
		...restProps
	} = props;
	const context = useHoverCardContext();
	const open = context?.open;
	const styles = context?.styles || hoverCard();
	const lazyMount = context?.lazyMount;
	const unmountOnExit = context?.unmountOnExit;
	const hasOpenedRef = context?.hasOpenedRef;
	// An explicit `placement` prop (threaded from the non-island composer)
	// takes priority over context — HonoX reconstructs an island's `children`
	// for hydration from a context-less snapshot, so context-derived values
	// would silently reset to their fallback default once the client
	// hydrates, while an explicit prop survives (see Popover's Positioner for
	// the same note).
	const placement = placementProp ?? context?.placement ?? "bottom";

	if (open && hasOpenedRef) {
		hasOpenedRef.current = true;
	}

	const shouldRender =
		!lazyMount || open || (hasOpenedRef?.current && !unmountOnExit);

	if (!shouldRender) {
		return null;
	}

	return (
		<div
			class={cx(
				styles.positioner,
				classProp,
				!open && css({ display: "none" }),
			)}
			data-state={open ? "open" : "closed"}
			data-scope="hover-card"
			data-part="positioner"
			data-placement={placement}
			style={{
				position: "absolute",
				...getPlacementStyle(placement, PLACEMENT_CONFIG),
			}}
			{...restProps}
		>
			{children}
		</div>
	);
}

export interface HoverCardContentProps extends PropsWithChildren {
	class?: string;
	placement?: HoverCardPlacement;
	[key: string]: unknown;
}

export function Content(props: HoverCardContentProps) {
	const {
		children,
		class: classProp,
		placement: placementProp,
		...restProps
	} = props;
	const context = useHoverCardContext();
	const id = context?.id;
	const open = context?.open;
	const styles = context?.styles || hoverCard();
	const lazyMount = context?.lazyMount;
	const unmountOnExit = context?.unmountOnExit;
	const hasOpenedRef = context?.hasOpenedRef;
	const placement = placementProp ?? context?.placement ?? "bottom";

	if (open && hasOpenedRef) {
		hasOpenedRef.current = true;
	}

	const shouldRender =
		!lazyMount || open || (hasOpenedRef?.current && !unmountOnExit);

	if (!shouldRender) {
		return null;
	}

	return (
		<div
			id={id ? `hover-card-content-${id}` : undefined}
			role="dialog"
			class={cx(styles.content, classProp)}
			data-state={open ? "open" : "closed"}
			data-scope="hover-card"
			data-part="content"
			data-placement={placement}
			{...restProps}
		>
			{children}
		</div>
	);
}

export function Arrow(
	props: PropsWithChildren<{ class?: string; placement?: HoverCardPlacement }>,
) {
	const {
		children,
		class: classProp,
		placement: placementProp,
		...restProps
	} = props;
	const context = useHoverCardContext();
	const styles = context?.styles || hoverCard();
	const placement = placementProp ?? context?.placement ?? "bottom";
	return (
		<div
			class={cx(styles.arrow, classProp)}
			data-scope="hover-card"
			data-part="arrow"
			style={getArrowStyle(placement, PLACEMENT_CONFIG)}
			{...restProps}
		>
			{children || <ArrowTip placement={placement} />}
		</div>
	);
}

export function ArrowTip(props: {
	class?: string;
	placement?: HoverCardPlacement;
}) {
	const { class: classProp, placement: placementProp, ...restProps } = props;
	const context = useHoverCardContext();
	const styles = context?.styles || hoverCard();
	const placement = placementProp ?? context?.placement ?? "bottom";
	return (
		<div
			class={cx(styles.arrowTip, classProp)}
			data-scope="hover-card"
			data-part="arrow-tip"
			style={{ transform: `rotate(${getArrowRotation(placement)}deg)` }}
			{...restProps}
		/>
	);
}

export function Context(props: {
	children: (context: HoverCardContextValue | null) => any;
}) {
	const context = useHoverCardContext();
	return props.children(context);
}

export function InteractiveHoverCardRoot(props: HoverCardRootProps) {
	const {
		open: openProp,
		children,
		id: idProp,
		openDelay = 600,
		closeDelay = 300,
		defaultOpen = false,
		onOpenChange,
		lazyMount,
		unmountOnExit,
		disabled = false,
		...rest
	} = props;
	const [isOpen, setIsOpen] = useState(openProp ?? defaultOpen);
	const isControlled = openProp !== undefined;
	const open = isControlled ? openProp : isOpen;

	const fallbackId = useId();
	const rootId = idProp || `hover-card-${fallbackId}`;
	const rootRef = useRef<HTMLDivElement>(null);
	const openTimerRef = useRef<number | null>(null);
	const closeTimerRef = useRef<number | null>(null);

	const clearTimers = () => {
		if (openTimerRef.current) {
			clearTimeout(openTimerRef.current);
			openTimerRef.current = null;
		}
		if (closeTimerRef.current) {
			clearTimeout(closeTimerRef.current);
			closeTimerRef.current = null;
		}
	};

	const handleOpenChangeRef = useRef<(nextOpen: boolean) => void>(() => {});
	useEffect(() => {
		handleOpenChangeRef.current = (nextOpen: boolean) => {
			if (!isControlled) {
				setIsOpen(nextOpen);
			}
			onOpenChange?.({ open: nextOpen });
		};
	}, [isControlled, onOpenChange]);

	const handleOpen = () => {
		if (disabled) return;
		if (closeTimerRef.current) {
			clearTimeout(closeTimerRef.current);
			closeTimerRef.current = null;
		}
		if (openTimerRef.current) return;

		openTimerRef.current = window.setTimeout(() => {
			handleOpenChangeRef.current(true);
			openTimerRef.current = null;
		}, openDelay);
	};

	const handleClose = () => {
		if (openTimerRef.current) {
			clearTimeout(openTimerRef.current);
			openTimerRef.current = null;
		}
		if (closeTimerRef.current) return;

		closeTimerRef.current = window.setTimeout(() => {
			handleOpenChangeRef.current(false);
			closeTimerRef.current = null;
		}, closeDelay);
	};

	// Bypasses openDelay/closeDelay — for discrete, deliberate actions
	// (a tap, Escape, clicking away) rather than a lingering hover, where a
	// grace-period debounce would just feel like lag.
	const openNow = () => {
		if (disabled) return;
		clearTimers();
		handleOpenChangeRef.current(true);
	};
	const closeNow = () => {
		clearTimers();
		handleOpenChangeRef.current(false);
	};

	useEffect(() => {
		if (typeof document === "undefined") return;

		const root = document.getElementById(rootId);
		if (!root) return;

		const getPositioners = () =>
			Array.from(
				root.querySelectorAll<HTMLElement>('[data-part="positioner"]'),
			);

		const openHoverCard = () => {
			root.setAttribute("data-state", "open");
			getPositioners().forEach((p) => {
				p.style.setProperty("display", "block", "important");
				p.setAttribute("data-state", "open");
			});
			positionOverlay(root, PLACEMENT_CONFIG);
			const content = root.querySelector<HTMLElement>('[data-part="content"]');
			if (content) {
				content.setAttribute("data-state", "open");
			}
			const trigger = root.querySelector<HTMLElement>('[data-part="trigger"]');
			if (trigger) {
				trigger.setAttribute("data-state", "open");
				trigger.setAttribute("aria-expanded", "true");
			}
		};

		const closeHoverCard = () => {
			root.setAttribute("data-state", "closed");
			getPositioners().forEach((p) => {
				p.style.setProperty("display", "none", "important");
				p.setAttribute("data-state", "closed");
			});
			const content = root.querySelector<HTMLElement>('[data-part="content"]');
			if (content) {
				content.setAttribute("data-state", "closed");
			}
			const trigger = root.querySelector<HTMLElement>('[data-part="trigger"]');
			if (trigger) {
				trigger.setAttribute("data-state", "closed");
				trigger.setAttribute("aria-expanded", "false");
			}
		};

		if (open) {
			openHoverCard();
		} else {
			closeHoverCard();
		}
	}, [rootId, open]);

	// Keeps the open card correctly placed (and its arrow correctly centered
	// — see `pointAtCenter` above) across viewport changes, mirroring
	// Popover's resize/scroll handling.
	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;

		const reposition = () => {
			if (root.getAttribute("data-state") === "open") {
				positionOverlay(root, PLACEMENT_CONFIG);
			}
		};

		window.addEventListener("resize", reposition);
		window.addEventListener("scroll", reposition, true);
		return () => {
			window.removeEventListener("resize", reposition);
			window.removeEventListener("scroll", reposition, true);
		};
	}, []);

	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;

		const trigger = root.querySelector<HTMLElement>('[data-part="trigger"]');
		const content = root.querySelector('[data-part="content"]');

		const onMouseEnter = () => {
			handleOpen();
		};
		const onMouseLeave = () => {
			handleClose();
		};

		if (trigger) {
			trigger.addEventListener("mouseenter", onMouseEnter);
			trigger.addEventListener("mouseleave", onMouseLeave);
		}

		if (content) {
			content.addEventListener("mouseenter", onMouseEnter);
			content.addEventListener("mouseleave", onMouseLeave);
		}

		// If the pointer is already over the trigger at hydration time, open.
		if (trigger?.matches(":hover")) {
			handleOpen();
		}

		// Keyboard equivalent of hover: focus landing anywhere inside root
		// (the trigger, or — once open — a focusable element inside the
		// content) opens it; focus leaving the root entirely closes it.
		// `focusin`/`focusout` (unlike `focus`/`blur`) bubble, so one pair of
		// listeners on root covers both the trigger and the content's own
		// interactive children without needing to know about them upfront.
		const onFocusIn = () => {
			handleOpen();
		};
		const onFocusOut = (e: FocusEvent) => {
			const next = e.relatedTarget as Node | null;
			if (next && root.contains(next)) return;
			handleClose();
		};
		root.addEventListener("focusin", onFocusIn);
		root.addEventListener("focusout", onFocusOut);

		// Touch has no real "hover" — mouseenter is unreliable at best on
		// touchscreens. A non-native trigger (a styled <div>/<span>, e.g. an
		// Avatar) has no click behavior of its own, so a tap can safely open
		// the card immediately. A native <button>/<a> trigger keeps its own
		// click semantics untouched (it may be a real link that should
		// navigate) — those triggers rely on the focus handling above instead.
		const onTriggerClick = () => {
			if (root.getAttribute("data-state") !== "open") {
				openNow();
			}
		};
		const isNativeControl =
			trigger?.tagName === "BUTTON" || trigger?.tagName === "A";
		if (trigger && !isNativeControl) {
			trigger.addEventListener("click", onTriggerClick);
		}

		// Escape and clicking/tapping elsewhere are the two dismiss paths a
		// hover card needs to satisfy WCAG 1.4.13 (Content on Hover or
		// Focus)'s "dismissible" criterion — without them, the only way to
		// close an open card is moving the mouse away, which leaves keyboard
		// and touch users with no way out. Deliberately NOT integrated with
		// the modal overlay stack (openOverlayRoots/applyInert) in
		// overlay-a11y.ts — that would make the rest of the page `inert`
		// while a card is merely hovered, which is far too aggressive for
		// this non-modal, low-commitment pattern.
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			if (root.getAttribute("data-state") !== "open") return;
			// Defer to a nested open overlay (e.g. a Popover triggered from
			// inside this card's content) — same cooperation Dialog/Drawer use,
			// so one Escape press closes the innermost thing first.
			if (hasOpenNested(root)) return;
			e.preventDefault();
			closeNow();
			trigger?.focus();
		};
		const onDocumentPointerDown = (e: Event) => {
			if (root.getAttribute("data-state") !== "open") return;
			if (root.contains(e.target as Node)) return;
			closeNow();
		};
		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("pointerdown", onDocumentPointerDown);

		return () => {
			if (trigger) {
				trigger.removeEventListener("mouseenter", onMouseEnter);
				trigger.removeEventListener("mouseleave", onMouseLeave);
				trigger.removeEventListener("click", onTriggerClick);
			}
			if (content) {
				content.removeEventListener("mouseenter", onMouseEnter);
				content.removeEventListener("mouseleave", onMouseLeave);
			}
			root.removeEventListener("focusin", onFocusIn);
			root.removeEventListener("focusout", onFocusOut);
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("pointerdown", onDocumentPointerDown);
			if (openTimerRef.current) clearTimeout(openTimerRef.current);
			if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
		};
	}, [openDelay, closeDelay, disabled]);

	return (
		<div
			id={rootId}
			ref={rootRef}
			data-hover-card-root
			data-overlay-root
			data-state={open ? "open" : "closed"}
			style={{ position: "relative", display: "inline-block" }}
		>
			<Root
				{...rest}
				id={idProp}
				open={open}
				lazyMount={lazyMount}
				unmountOnExit={unmountOnExit}
				disabled={disabled}
			>
				{children}
			</Root>
		</div>
	);
}
