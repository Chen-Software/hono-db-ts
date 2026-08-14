import { defineSlotRecipe } from "@pandacss/dev";

export const table = defineSlotRecipe({
	className: "table",
	slots: [
		"root",
		"body",
		"cell",
		"foot",
		"head",
		"header",
		"row",
		"caption",
		"hoverActions",
	],
	base: {
		root: {
			borderCollapse: "collapse",
			fontVariantNumeric: "lining-nums tabular-nums",
			textAlign: "start",
			verticalAlign: "top",
			width: "full",
		},
		cell: {
			alignItems: "center",
			color: "fg.muted",
			textAlign: "start",
			textOverflow: "ellipsis",
			textStyle: "sm",
			whiteSpace: "nowrap",
			overflow: "hidden",
			boxShadow: "inset 0 -1px 0 0 var(--shadow-color)",
			shadowColor: "border",
			_pinned: {
				bg: "inherit",
				boxShadow: "inset 0 -1px 0 0 var(--shadow-color)",
				overflow: "unset",
				position: "sticky",
				shadowColor: "border",
				zIndex: 1,
			},
		},
		row: {
			_last: { "& td": { boxShadow: "none" } },
			"&:hover [data-hover-actions]": { opacity: 1, pointerEvents: "auto" },
			// Set by JS while a hover-action opens something anchored to it (e.g.
			// TaskRowActionsMenu's dropdown) — the mouse may no longer be over the
			// row and the open menu lives outside it in the DOM, so neither
			// `:hover` above nor `_focusWithin` on the actions bar itself fires.
			"&[data-force-visible] [data-hover-actions]": {
				opacity: 1,
				pointerEvents: "auto",
			},
		},
		header: {
			textAlign: "left",
			verticalAlign: "middle",
			boxShadow: "inset 0 -1px 0 0 var(--shadow-color)",
			shadowColor: "border",
			_pinned: {
				position: "sticky",
				bg: "inherit",
				zIndex: 2,
			},
		},
		head: {
			color: "fg.muted",
			fontWeight: "semibold",
			textAlign: "start",
			whiteSpace: "nowrap",
			textStyle: "xs",
		},
		caption: {
			color: "fg.subtle",
			fontWeight: "medium",
		},
		foot: {
			fontWeight: "medium",
			"& td": {
				boxShadow: "inset 0 1px 0 0 var(--shadow-color)!",
				shadowColor: "border",
			},
		},
		hoverActions: {
			position: "absolute",
			insetBlock: "0",
			insetInlineEnd: "0",
			display: "inline-flex",
			alignItems: "center",
			gap: "2",
			paddingInline: "3",
			// Same frosted-glass idiom as the site's sticky headers (see e.g.
			// routes/tasks/index.tsx's <header>) — translucent tinted bg +
			// blur/saturate, so it reads as glass over whatever it overlaps
			// rather than a flat opaque patch. Stronger blur than the header's
			// (20px) since this floats over much sparser content (a couple of
			// table cells) and needs more radius to read as glass at a glance.
			bg: { _light: "white.a7", _dark: "black.a7" },
			backdropFilter: "blur(32px) saturate(180%)",
			borderInlineStartWidth: "1px",
			borderColor: { _light: "white.a4", _dark: "black.a4" },
			boxShadow: "md",
			opacity: 0,
			pointerEvents: "none",
			transition: "opacity 0.15s",
			zIndex: 1,
			_focusWithin: { opacity: 1, pointerEvents: "auto" },
		},
	},
	defaultVariants: {
		size: "md",
		variant: "plain",
	},
	variants: {
		variant: {
			surface: {
				header: { bg: "gray.surface.bg.hover" },
				row: { bg: "gray.surface.bg" },
			},
			plain: {},
		},
		striped: {
			true: {
				row: { "&:nth-of-type(odd) td": { bg: "gray.surface.bg.hover" } },
			},
		},
		interactive: {
			true: {
				body: { "& tr": { _hover: { bg: "gray.surface.bg.hover" } } },
			},
		},
		columnBorder: {
			true: {
				header: { "&:not(:last-of-type)": { borderInlineEndWidth: "1px" } },
				cell: { "&:not(:last-of-type)": { borderInlineEndWidth: "1px" } },
			},
		},
		stickyHeader: {
			true: {
				head: {
					"& :where(tr)": {
						top: "var(--table-sticky-offset, 0)",
						position: "sticky",
						zIndex: 2,
					},
				},
			},
		},
		size: {
			md: {
				root: { textStyle: "sm" },
				header: { px: "3", py: "3" },
				cell: { px: "3", py: "3" },
			},
		},
	},
});
