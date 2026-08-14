import { useEffect, useRef } from "hono/jsx";

/**
 * Shared accessibility + behavior layer for overlay components
 * (Dialog, Drawer, Popover, Tooltip, and any future modal-like or
 * anchored-floating surface).
 *
 * Keeps a SINGLE source of truth for:
 *  - the stack of currently-open overlay roots (so nested overlays — including a
 *    Dialog opened from within a Drawer — cooperate on `inert` and focus trapping)
 *  - the focus-trap / Escape / scroll-lock / focus-return effect
 *  - click delegation (trigger / backdrop / close-trigger / action-trigger)
 *  - accessible-name tree scan (used by `Content` to wire `aria-labelledby` /
 *    `aria-describedby` only when the corresponding Title / Description is present)
 *  - deferring `display: none` until an element's CSS exit animation actually
 *    finishes, so `_closed` animation styles (defined in the recipes) get a
 *    chance to play instead of being cut off by an instant unmount/hide
 *
 * Primitives must render `data-part="content"`, `data-part="trigger"`,
 * `data-part="backdrop"`, `data-part="positioner"`, `data-part="close-trigger"`,
 * `data-part="action-trigger"`, `data-part="title"`, `data-part="description"`
 * for the behavior layer and detection to work.
 */

// Selector for focusable elements inside an overlay's content.
const FOCUSABLE_SELECTOR =
	"a[href],area[href],button:not([disabled]),input:not([disabled])," +
	"select:not([disabled]),textarea:not([disabled]),iframe:not([disabled])," +
	'object:not([disabled]),embed,[tabindex]:not([tabindex="-1"]),' +
	'[contenteditable]:not([contenteditable="false"])';

/**
 * Stack of currently-open overlay root elements (topmost = last).
 * Drives focus trapping (only the topmost handles keys) and the `inert` math
 * so a nested overlay correctly disables the page AND its parent.
 */
export const openOverlayRoots: HTMLElement[] = [];

/** Check if there are any open nested overlay elements inside the container. */
export function hasOpenNested(root: HTMLElement): boolean {
	return (
		root.querySelectorAll('[data-overlay-root][data-state="open"]').length > 0
	);
}

/** Query focusable descendants of `container`, excluding hidden/disabled ones. */
export function getFocusable(container: HTMLElement): HTMLElement[] {
	return Array.from(
		container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
	).filter(
		(el) =>
			!el.hasAttribute("disabled") &&
			(el.offsetParent !== null || el === document.activeElement),
	);
}

/**
 * Inert every sibling along the ancestor chain of each open overlay,
 * except the path to an overlay and except ancestors of any open overlay.
 * Recomputes the whole document so closing one overlay restores the rest.
 */
export function applyInert() {
	document.querySelectorAll<HTMLElement>("[inert]").forEach((el) => {
		el.inert = false;
	});
	for (const root of openOverlayRoots) {
		const path = new Set<HTMLElement>();
		let p: HTMLElement | null = root;
		while (p && p !== document.body) {
			path.add(p);
			p = p.parentElement;
		}
		let node: HTMLElement | null = root.parentElement;
		while (node && node !== document.body) {
			for (const sib of Array.from(node.children)) {
				if (path.has(sib as HTMLElement)) continue;
				const protects = openOverlayRoots.some(
					(r) => sib === r || sib.contains(r),
				);
				if (!protects) (sib as HTMLElement).inert = true;
			}
			node = node.parentElement;
		}
	}
}

/**
 * Recursively check whether a `<Title>` / `<Description>` component instance
 * (by function reference) exists in the rendered children tree. Used by `Content`
 * to decide whether to wire `aria-labelledby` / `aria-describedby` — and avoid
 * pointing those attributes at non-existent elements when the part is omitted.
 *
 * Detection is by component TYPE reference (not by a `data-part` prop), because
 * the `data-part` marker is applied inside the component's render and is NOT
 * present on the component element's props at the point `Content` inspects them.
 */
export function hasPart(node: unknown, cmp: unknown): boolean {
	if (node == null || typeof node !== "object") return false;
	if (Array.isArray(node)) return node.some((c) => hasPart(c, cmp));
	const el = node as { type?: unknown; props?: { children?: unknown } };
	if (el.type === cmp) return true;
	if (el.props?.children != null) return hasPart(el.props.children, cmp);
	return false;
}

/**
 * Waits for `el`'s running CSS animation to finish before calling `onDone`,
 * so an exit (`_closed`) animation gets a chance to play instead of being
 * cut off by an instant `display: none`. Falls back to the element's
 * computed `animation-duration` (plus a small buffer) in case `animationend`
 * never fires — e.g. no matching animation, or a duration of 0.
 *
 * Returns a canceler: call it if the hide is superseded (e.g. the overlay is
 * reopened before the exit animation finished) to suppress the pending `onDone`.
 */
export function whenAnimationEnds(
	el: HTMLElement,
	onDone: () => void,
): () => void {
	let settled = false;
	let timer: any = null;
	let rafId: number | null = null;

	const cleanup = () => {
		el.removeEventListener("animationend", onAnimationEnd);
		el.removeEventListener("transitionend", onTransitionEnd);
		if (timer) clearTimeout(timer);
		if (rafId !== null) cancelAnimationFrame(rafId);
	};
	const finish = () => {
		if (settled) return;
		settled = true;
		cleanup();
		onDone();
	};
	const onAnimationEnd = (e: AnimationEvent) => {
		if (e.target === el) finish();
	};
	const onTransitionEnd = (e: TransitionEvent) => {
		if (e.target === el) finish();
	};

	el.addEventListener("animationend", onAnimationEnd);
	el.addEventListener("transitionend", onTransitionEnd);

	// Force a synchronous layout/style reflow so the browser registers the state changes
	const _unused = el.offsetHeight;

	// Defer duration calculation to the next frame so that browser matches active transition/animation styles
	rafId = requestAnimationFrame(() => {
		rafId = null;
		if (settled) return;

		const computedStyle = getComputedStyle(el);
		const getDurationMs = (styleVal: string) => {
			return styleVal.split(",").reduce((max, part) => {
				const match = /^([\d.]+)(ms|s)$/.exec(part.trim());
				if (!match) return max;
				const value =
					Number.parseFloat(match[1]) * (match[2] === "s" ? 1000 : 1);
				return Math.max(max, value);
			}, 0);
		};

		const animDuration = getDurationMs(computedStyle.animationDuration);
		const transDuration = getDurationMs(computedStyle.transitionDuration);
		const maxDuration = Math.max(animDuration, transDuration);

		timer = window.setTimeout(finish, maxDuration + 50);
	});

	return () => {
		settled = true;
		cleanup();
	};
}

/**
 * Registers the element with id `rootId` on the shared `openOverlayRoots`
 * stack for as long as `open` is true.
 *
 * `useOverlay` below only lets a Dialog/Drawer react to Escape/Tab when its
 * own root is the *topmost* entry on that stack — but Select, Dropdown,
 * Combobox, and Popover manage their own open/close state and never call
 * `useOverlay`, so they're otherwise invisible to that check. Left
 * unregistered, opening one of them nested inside a Dialog/Drawer still
 * leaves the Dialog "topmost" (the only entry), so its window-level
 * *capture*-phase Escape handler fires first and closes the whole Dialog —
 * before the nested overlay's own bubble-phase Escape handler ever runs.
 *
 * Deliberately lighter than `useOverlay`'s activate/deactivate: it only
 * affects stack membership (and the `inert` math, via `applyInert`), not
 * focus trapping, scroll locking, or focus management — the primitive keeps
 * handling those itself.
 */
export function useOverlayStackEntry(rootId: string, open: boolean) {
	useEffect(() => {
		if (!open) return;
		const root = document.getElementById(rootId);
		if (!root) return;
		openOverlayRoots.push(root);
		applyInert();
		return () => {
			const idx = openOverlayRoots.indexOf(root);
			if (idx !== -1) {
				openOverlayRoots.splice(idx, 1);
			}
			applyInert();
		};
	}, [open, rootId]);
}

export interface OverlayOptions {
	/** Ref holding the overlay root element (the wrapping `<div id=...>`). */
	rootRef: { current: HTMLElement | null };
	/** Whether the overlay is currently open. */
	open: boolean;
	/** Close when Escape is pressed. Default: true. */
	closeOnEscape: boolean;
	/** Close when the backdrop is clicked / interaction occurs outside. Default: true. */
	closeOnInteractOutside: boolean;
	/** Lock body scroll while open. Default: true. */
	preventScroll?: boolean;
	/** Trap Tab/Shift+Tab focus cycling within the content. Default: true. */
	trapFocus?: boolean;
	/** Notifies the owner of an open/close request originating from behavior (Escape / outside click). */
	onChange: (open: boolean) => void;
	/** Element to focus when the overlay opens. Defaults to the first focusable. */
	initialFocusEl?: () => HTMLElement | null;
	/** Element to focus when the overlay closes. Defaults to the trigger. */
	finalFocusEl?: () => HTMLElement | null;
	/** Fired on Escape keydown while open, before the close-on-escape default runs. Call `event.preventDefault()` to suppress the default close. */
	onEscapeKeyDown?: (event: KeyboardEvent) => void;
	/** Fired on an outside backdrop/positioner interaction, before the close-on-interact-outside default runs. Call `event.preventDefault()` to suppress the default close. */
	onInteractOutside?: (event: Event) => void;
	/** Fired once the close (exit) animation has fully finished, after focus has been returned. */
	onExitComplete?: () => void;
}

/**
 * Full overlay behavior: click delegation (open/close via `data-part`) +
 * accessibility layer (focus trap, Escape, inert background, scroll lock,
 * focus return to trigger on close). Runs whenever `open` or the gate props change.
 */
export function useOverlay(opts: OverlayOptions) {
	const {
		rootRef,
		open,
		closeOnEscape,
		closeOnInteractOutside,
		preventScroll = true,
		trapFocus = true,
		onChange,
		initialFocusEl,
		finalFocusEl,
		onEscapeKeyDown,
		onInteractOutside,
		onExitComplete,
	} = opts;

	// Keep the latest options in refs to prevent event listener thrashing.
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	const closeOnEscapeRef = useRef(closeOnEscape);
	closeOnEscapeRef.current = closeOnEscape;

	const closeOnInteractOutsideRef = useRef(closeOnInteractOutside);
	closeOnInteractOutsideRef.current = closeOnInteractOutside;

	const preventScrollRef = useRef(preventScroll);
	preventScrollRef.current = preventScroll;

	const trapFocusRef = useRef(trapFocus);
	trapFocusRef.current = trapFocus;

	const initialFocusElRef = useRef(initialFocusEl);
	initialFocusElRef.current = initialFocusEl;

	const finalFocusElRef = useRef(finalFocusEl);
	finalFocusElRef.current = finalFocusEl;

	const onEscapeKeyDownRef = useRef(onEscapeKeyDown);
	onEscapeKeyDownRef.current = onEscapeKeyDown;

	const onInteractOutsideRef = useRef(onInteractOutside);
	onInteractOutsideRef.current = onInteractOutside;

	const onExitCompleteRef = useRef(onExitComplete);
	onExitCompleteRef.current = onExitComplete;

	const showRef = useRef<() => void>(() => {});
	const hideRef = useRef<() => void>(() => {});

	// --- Sync open prop changes (for controlled / initial state) ---
	useEffect(() => {
		if (open) {
			showRef.current?.();
		} else {
			hideRef.current?.();
		}
	}, [open]);

	// --- Single mount effect for event-driven DOM behavior and overlay lifecycle ---
	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;

		let prevFocus: HTMLElement | null = null;
		let prevOverflow = "";
		let scrollLocked = false;

		const getElements = () => ({
			positioners: Array.from(
				root.querySelectorAll<HTMLElement>('[data-part="positioner"]'),
			),
			backdrops: Array.from(
				root.querySelectorAll<HTMLElement>('[data-part="backdrop"]'),
			),
			contents: Array.from(
				root.querySelectorAll<HTMLElement>('[data-part="content"]'),
			),
		});

		const activate = () => {
			const { contents } = getElements();
			const content = contents[0];
			if (!content) return;

			prevFocus = document.activeElement as HTMLElement | null;
			openOverlayRoots.push(root);
			applyInert();
			if (preventScrollRef.current) {
				prevOverflow = document.body.style.overflow;
				document.body.style.overflow = "hidden";
				scrollLocked = true;
			}

			// Move focus into the overlay (initialFocusEl > first focusable > content)
			const focusables = getFocusable(content);
			const elToFocus =
				initialFocusElRef.current?.() ?? focusables[0] ?? content;
			if (elToFocus) {
				elToFocus.focus();
			}
		};

		let cancelPendingHide = () => {};

		const deactivate = () => {
			const idx = openOverlayRoots.indexOf(root);
			if (idx !== -1) {
				openOverlayRoots.splice(idx, 1);
			}
			applyInert();
			if (scrollLocked && openOverlayRoots.length === 0) {
				document.body.style.overflow = prevOverflow || "";
			}
			// Return focus to the trigger (or finalFocusEl) on close
			const elToFocus = finalFocusElRef.current?.() ?? prevFocus;
			if (elToFocus && typeof elToFocus.focus === "function") {
				elToFocus.focus();
			}
		};

		const hide = () => {
			if (root.getAttribute("data-state") === "closed") return;

			const { positioners, backdrops, contents } = getElements();
			root.setAttribute("data-state", "closed");
			for (const p of positioners) {
				p.setAttribute("data-state", "closed");
			}
			for (const b of backdrops) {
				b.setAttribute("data-state", "closed");
			}
			for (const c of contents) {
				c.setAttribute("data-state", "closed");
			}

			cancelPendingHide();
			const animatedEl = contents[0] || positioners[0] || backdrops[0];
			if (animatedEl) {
				cancelPendingHide = whenAnimationEnds(animatedEl, () => {
					if (root.getAttribute("data-state") === "closed") {
						deactivate();
						for (const p of positioners) {
							p.style.cssText =
								"display: none !important; visibility: hidden !important;";
						}
						for (const b of backdrops) {
							b.style.cssText =
								"display: none !important; visibility: hidden !important;";
						}
						for (const c of contents) {
							c.style.cssText =
								"display: none !important; visibility: hidden !important;";
						}
						onExitCompleteRef.current?.();
					}
				});
			} else {
				deactivate();
				for (const p of positioners) {
					p.style.cssText =
						"display: none !important; visibility: hidden !important;";
				}
				for (const b of backdrops) {
					b.style.cssText =
						"display: none !important; visibility: hidden !important;";
				}
				for (const c of contents) {
					c.style.cssText =
						"display: none !important; visibility: hidden !important;";
				}
				onExitCompleteRef.current?.();
			}
		};

		const show = () => {
			cancelPendingHide();
			if (root.getAttribute("data-state") === "open") return;

			const { positioners, backdrops, contents } = getElements();
			root.setAttribute("data-state", "open");
			for (const p of positioners) {
				p.style.cssText =
					"display: flex !important; visibility: visible !important;";
				p.setAttribute("data-state", "open");
			}
			for (const b of backdrops) {
				b.style.cssText =
					"display: block !important; visibility: visible !important;";
				b.setAttribute("data-state", "open");
			}
			for (const c of contents) {
				c.setAttribute("data-state", "open");
				c.style.cssText =
					"display: flex !important; visibility: visible !important;";
			}

			activate();
		};

		// Assign refs so the sync effect can trigger show/hide
		showRef.current = show;
		hideRef.current = hide;

		// If initially open, activate
		if (open) {
			show();
		}

		const handleClick = (e: Event) => {
			const target = (e.target as HTMLElement).closest(
				"[data-part]",
			) as HTMLElement;
			if (!target) return;

			// Ignore clicks that originate from elements belonging to a nested or different overlay
			const owner = target.closest("[data-overlay-root]");
			if (owner && owner !== root) return;

			const dataPart = target.getAttribute("data-part");

			if (dataPart === "backdrop" || dataPart === "positioner") {
				// Only close if we clicked EXACTLY on the backdrop/positioner, not its children (Content)
				if (e.target === target) {
					if (hasOpenNested(root)) {
						return;
					}
					onInteractOutsideRef.current?.(e);
					if (closeOnInteractOutsideRef.current && !e.defaultPrevented) {
						hide();
						onChangeRef.current(false);
					}
				}
			} else if (dataPart === "trigger") {
				const currentOpen = root.getAttribute("data-state") === "open";
				const nextOpen = !currentOpen;
				if (nextOpen) {
					show();
				} else {
					hide();
				}
				onChangeRef.current(nextOpen);
			} else if (
				dataPart === "close-trigger" ||
				dataPart === "action-trigger"
			) {
				hide();
				onChangeRef.current(false);
			}
		};

		const onKeyDown = (e: KeyboardEvent) => {
			const isCurrentlyOpen = root.getAttribute("data-state") === "open";
			if (!isCurrentlyOpen) return;

			// Only the topmost (most recently opened) overlay handles keys
			if (openOverlayRoots[openOverlayRoots.length - 1] !== root) return;

			if (e.key === "Escape") {
				if (hasOpenNested(root)) {
					return;
				}
				onEscapeKeyDownRef.current?.(e);
				if (closeOnEscapeRef.current && !e.defaultPrevented) {
					e.preventDefault();
					hide();
					onChangeRef.current(false);
				}
				return;
			}
			if (e.key === "Tab") {
				if (!trapFocusRef.current) return;
				const { contents } = getElements();
				const content = contents[0];
				if (!content) return;

				const f = getFocusable(content);
				if (f.length === 0) {
					e.preventDefault();
					content.focus();
					return;
				}
				const first = f[0];
				const last = f[f.length - 1];
				if (e.shiftKey && document.activeElement === first) {
					e.preventDefault();
					last.focus();
				} else if (!e.shiftKey && document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			}
		};

		root.addEventListener("click", handleClick);
		window.addEventListener("keydown", onKeyDown, true);

		return () => {
			cancelPendingHide();
			root.removeEventListener("click", handleClick);
			window.removeEventListener("keydown", onKeyDown, true);
			deactivate(); // Clean up overlay state on unmount
		};
	}, [rootRef]);
}
