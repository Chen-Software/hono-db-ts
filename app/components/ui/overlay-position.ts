/**
 * Shared placement geometry for trigger-anchored floating surfaces
 * (Popover, Tooltip, and any future anchored overlay).
 *
 * Every consumer renders `data-part="trigger"`, `data-part="positioner"`,
 * `data-part="content"`, `data-part="arrow"` / `data-part="arrow-tip"`, and
 * sets `data-placement` (the requested side) on its positioner(s) for
 * `positionOverlay` to read and `data-effective-placement` to be written back to.
 *
 * There is no ResizeObserver / scroll-container tracking here (unlike
 * Floating UI) — repositioning is meant to be re-run on demand (on open and
 * on window `resize`) by the caller.
 */

const CENTER_ARROW_OFFSET = "50%";

/**
 * Elements owned by `root` — i.e. not belonging to a nested overlay instance
 * mounted inside `root`'s own content (e.g. a submenu, or a Popover opened
 * from within another Popover's content). Every overlay root must carry a
 * `data-overlay-root` marker for this scoping to work.
 */
export function ownedBy<T extends HTMLElement>(
	root: HTMLElement,
	selector: string,
): T[] {
	return Array.from(root.querySelectorAll<T>(selector)).filter(
		(el) => el.closest("[data-overlay-root]") === root,
	);
}

export type OverlayPlacement = "top" | "bottom" | "left" | "right";

export interface OverlayPlacementConfig {
	/**
	 * Cross-axis alignment of the positioner relative to the trigger.
	 * "start" aligns the positioner's leading edge with the trigger's
	 * (Popover's convention, for wide content). "center" centers the
	 * positioner over the trigger (Tooltip's convention, for narrow content).
	 * "end" aligns the positioner's trailing edge with the trigger's
	 * (Dropdown's convention, for menus that hang off either side of a
	 * narrow trigger — e.g. `bottomRight`/`bottom-end`).
	 */
	align: "start" | "center" | "end";
	/** Arrow inset from the aligned edge. Only used when `align` is "start" or "end". */
	arrowOffset?: string;
	/** Minimum gap from the viewport edge, in pixels. Default: 8. */
	viewportGap?: number;
	/** Whether the arrow should point exactly at the center of the trigger. */
	pointAtCenter?: boolean;
}

/** Base (non-flipped) positioner offset + cross-axis alignment for a placement. */
export function getPlacementStyle(
	placement: OverlayPlacement,
	config: OverlayPlacementConfig,
) {
	const gap = "var(--arrow-size)";
	const { align } = config;
	const center = align === "center";
	const crossTransform = (axis: "X" | "Y") =>
		center ? `translate${axis}(-50%)` : "none";
	// For top/bottom placements the cross axis is horizontal (left/right);
	// for left/right placements it's vertical (top/bottom).
	const leading = center ? "50%" : align === "end" ? "auto" : "0";
	const trailing = align === "end" ? "0" : "auto";

	switch (placement) {
		case "top":
			return {
				top: "auto",
				bottom: "100%",
				left: leading,
				right: trailing,
				transform: crossTransform("X"),
				marginBottom: gap,
				marginTop: "0",
			};
		case "left":
			return {
				top: leading,
				bottom: trailing,
				left: "auto",
				right: "100%",
				transform: crossTransform("Y"),
				marginRight: gap,
				marginLeft: "0",
			};
		case "right":
			return {
				top: leading,
				bottom: trailing,
				left: "100%",
				right: "auto",
				transform: crossTransform("Y"),
				marginLeft: gap,
				marginRight: "0",
			};
		default:
			return {
				top: "100%",
				bottom: "auto",
				left: leading,
				right: trailing,
				transform: crossTransform("X"),
				marginTop: gap,
				marginBottom: "0",
			};
	}
}

/** Arrow inset from the positioner's aligned edge, per placement. */
export function getArrowStyle(
	placement: OverlayPlacement,
	config: OverlayPlacementConfig,
) {
	const size = "var(--arrow-size)";
	const neg = `calc(${size} * -0.5)`;
	const { align } = config;
	const center = align === "center";
	const isEnd = align === "end";
	const inset = center ? CENTER_ARROW_OFFSET : (config.arrowOffset ?? "16px");
	const crossTransform = (axis: "X" | "Y") =>
		center ? `translate${axis}(-50%)` : "none";
	const leading = isEnd ? "auto" : inset;
	const trailing = isEnd ? inset : "auto";

	switch (placement) {
		case "top":
			return {
				top: "auto",
				bottom: neg,
				left: leading,
				right: trailing,
				transform: crossTransform("X"),
			};
		case "left":
			return {
				top: leading,
				bottom: trailing,
				left: "auto",
				right: neg,
				transform: crossTransform("Y"),
			};
		case "right":
			return {
				top: leading,
				bottom: trailing,
				left: neg,
				right: "auto",
				transform: crossTransform("Y"),
			};
		default:
			return {
				top: neg,
				bottom: "auto",
				left: leading,
				right: trailing,
				transform: crossTransform("X"),
			};
	}
}

/** Diamond rotation that points the arrow tip back at the trigger. */
export function getArrowRotation(placement: OverlayPlacement): number {
	switch (placement) {
		case "top":
			return 225;
		case "left":
			return 135;
		case "right":
			return 315;
		default:
			return 45;
	}
}

export function getTransformOrigin(
	placement: OverlayPlacement,
	align: OverlayPlacementConfig["align"],
): string {
	if (align === "center") {
		switch (placement) {
			case "top":
				return "bottom center";
			case "left":
				return "center right";
			case "right":
				return "center left";
			default:
				return "top center";
		}
	}
	// For top/bottom placements the cross keyword is left/right; for
	// left/right placements it's top/bottom.
	const isEnd = align === "end";
	switch (placement) {
		case "top":
			return `bottom ${isEnd ? "right" : "left"}`;
		case "left":
			return `${isEnd ? "bottom" : "top"} right`;
		case "right":
			return `${isEnd ? "bottom" : "top"} left`;
		default:
			return `top ${isEnd ? "right" : "left"}`;
	}
}

/**
 * Resolves the effective placement and applies it to every positioner + arrow
 * owned by `root` (see {@link ownedBy}), flipping to the opposite side when
 * the requested placement would overflow the viewport and the opposite side
 * has more room. Also re-clamps the cross axis so the content never renders
 * off-screen, and is meant to be re-run on open and on resize while open.
 */
export function positionOverlay(
	root: HTMLElement,
	config: OverlayPlacementConfig,
) {
	if (typeof window === "undefined") return;
	const gap = config.viewportGap ?? 8;
	const trigger = ownedBy<HTMLElement>(root, '[data-part="trigger"]')[0];
	const triggerRect = trigger?.getBoundingClientRect();

	for (const positioner of ownedBy<HTMLElement>(
		root,
		'[data-part="positioner"]',
	)) {
		const preferred =
			(positioner.getAttribute("data-placement") as OverlayPlacement) ||
			"bottom";
		let placement = preferred;
		Object.assign(positioner.style, getPlacementStyle(placement, config));

		const content = positioner.querySelector<HTMLElement>(
			'[data-part="content"]',
		);
		const contentRect = (content ?? positioner).getBoundingClientRect();

		if (triggerRect) {
			const spaceBelow = window.innerHeight - triggerRect.bottom;
			const spaceAbove = triggerRect.top;
			const spaceRight = window.innerWidth - triggerRect.right;
			const spaceLeft = triggerRect.left;

			if (
				placement === "bottom" &&
				contentRect.height > spaceBelow - gap &&
				spaceAbove > spaceBelow
			) {
				placement = "top";
			} else if (
				placement === "top" &&
				contentRect.height > spaceAbove - gap &&
				spaceBelow > spaceAbove
			) {
				placement = "bottom";
			} else if (
				placement === "right" &&
				contentRect.width > spaceRight - gap &&
				spaceLeft > spaceRight
			) {
				placement = "left";
			} else if (
				placement === "left" &&
				contentRect.width > spaceLeft - gap &&
				spaceRight > spaceLeft
			) {
				placement = "right";
			}

			if (placement !== preferred) {
				Object.assign(positioner.style, getPlacementStyle(placement, config));
			}

			// Flipping to the roomier side (above) still isn't a guarantee that
			// side has *enough* room — e.g. a tall popover triggered from the
			// vertical middle of a short viewport. Cap the main axis to whatever
			// space actually exists there so `maxHeight: var(--available-height)`
			// (see popover/dropdown/select/combobox recipes) turns overflow into
			// an internal scroll instead of letting content run past the edge.
			const availableHeight =
				placement === "top"
					? spaceAbove - gap
					: placement === "bottom"
						? spaceBelow - gap
						: window.innerHeight - 2 * gap;
			positioner.style.setProperty(
				"--available-height",
				`${Math.max(0, availableHeight)}px`,
			);
		} else {
			positioner.style.setProperty(
				"--available-height",
				`${Math.max(0, window.innerHeight - 2 * gap)}px`,
			);
		}

		// Clamp the cross axis so the content stays within the viewport, by
		// nudging the existing alignment transform rather than the base offset.
		const rect = positioner.getBoundingClientRect();
		const base = config.align === "center" ? "-50%" : "0px";
		// Tracks how far the clamp above nudges the box, so the arrow offset
		// below can be counter-adjusted by the same amount — otherwise the
		// arrow (positioned independently, relative to the box) stays put
		// while the box it's anchored to slides out from under it, and ends
		// up pointing at empty space instead of the trigger.
		let crossAxisShift = 0;
		if (placement === "top" || placement === "bottom") {
			let shift = 0;
			const overflowRight = rect.right - (window.innerWidth - gap);
			if (overflowRight > 0) shift -= overflowRight;
			if (rect.left + shift < gap) shift += gap - (rect.left + shift);
			if (shift !== 0) {
				positioner.style.transform = `translateX(calc(${base} + ${shift}px))`;
			}
			crossAxisShift = shift;
		} else {
			let shift = 0;
			const overflowBottom = rect.bottom - (window.innerHeight - gap);
			if (overflowBottom > 0) shift -= overflowBottom;
			if (rect.top + shift < gap) shift += gap - (rect.top + shift);
			if (shift !== 0) {
				positioner.style.transform = `translateY(calc(${base} + ${shift}px))`;
			}
			crossAxisShift = shift;
		}

		positioner.setAttribute("data-effective-placement", placement);
		positioner.style.setProperty(
			"--transform-origin",
			getTransformOrigin(placement, config.align),
		);

		const arrow = positioner.querySelector<HTMLElement>('[data-part="arrow"]');
		if (arrow) {
			let arrowStyleConfig = config;
			if (config.pointAtCenter && triggerRect) {
				const arrowSize = 12; // Standard arrow-size is 12px
				const dim =
					placement === "top" || placement === "bottom"
						? triggerRect.width
						: triggerRect.height;
				const calculatedOffset = `${dim / 2 - arrowSize / 2}px`;
				arrowStyleConfig = {
					...config,
					arrowOffset: calculatedOffset,
				};
			}
			Object.assign(arrow.style, getArrowStyle(placement, arrowStyleConfig));
			if (crossAxisShift !== 0) {
				const isEnd = config.align === "end";
				if (placement === "top" || placement === "bottom") {
					if (isEnd) {
						arrow.style.right = `calc(${arrow.style.right} + ${crossAxisShift}px)`;
					} else {
						arrow.style.left = `calc(${arrow.style.left} + ${-crossAxisShift}px)`;
					}
				} else {
					if (isEnd) {
						arrow.style.bottom = `calc(${arrow.style.bottom} + ${crossAxisShift}px)`;
					} else {
						arrow.style.top = `calc(${arrow.style.top} + ${-crossAxisShift}px)`;
					}
				}
			}
			const tip = arrow.querySelector<HTMLElement>('[data-part="arrow-tip"]');
			if (tip) {
				tip.style.transform = `rotate(${getArrowRotation(placement)}deg)`;
			}
		}
	}
}
