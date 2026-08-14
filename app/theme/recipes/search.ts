import { defineSlotRecipe } from "@pandacss/dev";
import { input } from "./input";

// `input`'s size variants set the shorthand `px`, which would otherwise
// collide with the fixed `pl`/`pr` search reserves for its icon and clear
// button below — strip it so those never fight over the same padding.
const withoutPx = <T extends { px?: unknown }>({ px: _px, ...rest }: T) => rest;

// Search slot recipe — joins the design system by reusing the shared `input`
// recipe for the field and resolving all accent colors through `colorPalette`
// semantic tokens (so the component themes with the rest of the system instead
// of hardcoding `blue.*`). Focus treatment uses `focusVisibleRing` to match
// every other form control.
export const search = defineSlotRecipe({
	className: "search",
	slots: [
		"root",
		"inputWrap",
		"input",
		"icon",
		"clearTrigger",
		"listbox",
		"item",
		"itemTitle",
		"itemDescription",
		"itemTags",
		"countText",
		"status",
	],
	base: {
		root: {
			width: "full",
			display: "flex",
			flexDirection: "column",
			gap: "1",
		},
		inputWrap: {
			position: "relative",
			width: "full",
		},
		input: {
			...input.base,
			pl: "10",
			pr: "10",
		},
		icon: {
			position: "absolute",
			left: "3",
			top: "50%",
			transform: "translateY(-50%)",
			color: "fg.muted",
			pointerEvents: "none",
			zIndex: "1",
			display: "inline-flex",
		},
		clearTrigger: {
			position: "absolute",
			right: "2",
			top: "50%",
			transform: "translateY(-50%)",
			color: "fg.muted",
			cursor: "pointer",
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			boxSize: "6",
			borderRadius: "l1",
			focusVisibleRing: "outside",
			transition: "colors",
			_hover: {
				color: "fg.default",
				background: "gray.plain.bg.hover",
			},
			_disabled: {
				layerStyle: "disabled",
			},
		},
		listbox: {
			position: "absolute",
			top: "calc(100% + 6px)",
			left: "0",
			right: "0",
			// `gray.surface.bg` (not `colorPalette.surface.bg`) so the panel stays
			// a neutral opaque white/gray.1 regardless of accent — matches how
			// dropdown/dialog keep their dropdown surfaces neutral. (`bg.default` was
			// dead: that token was stripped from the Panda preset by this repo's
			// "Remove Panda Preset Colors" plugin and never replaced, so it
			// silently compiled to invalid, ignored CSS and rendered transparent.)
			bg: "gray.surface.bg",
			borderWidth: "1px",
			borderColor: "gray.outline.border",
			borderRadius: "l2",
			boxShadow: "lg",
			zIndex: "dropdown",
			// Viewport-aware so the dropdown never runs off-screen when the input
			// sits low on the page (this component has no positioner supplying
			// `--available-height`, so clamp against the viewport directly).
			maxHeight: "min(20rem, 60vh)",
			overflowY: "auto",
			overscrollBehavior: "contain",
			padding: "1",
			transformOrigin: "top",
			animationStyle: "slide-fade-in",
			animationDuration: "fast",
		},
		item: {
			bg: "transparent",
			display: "flex",
			flexDirection: "column",
			gap: "0.5",
			px: "3",
			py: "2.5",
			borderRadius: "l1",
			cursor: "pointer",
			transition: "colors",
			// Highlight tints only the background; title/description keep their
			// neutral colors so contrast stays predictable across all palettes.
			_highlighted: {
				bg: "colorPalette.subtle.bg",
			},
		},
		itemTitle: {
			fontWeight: "medium",
			color: "fg.default",
			textStyle: "sm",
		},
		itemDescription: {
			textStyle: "xs",
			color: "fg.muted",
			lineClamp: "2",
		},
		itemTags: {
			textStyle: "2xs",
			// `plain.fg` (accent-tinted, readable) — not `solid.fg`, which is
			// white and only legible on the solid accent fill, not this plain bg.
			color: "colorPalette.plain.fg",
			mt: "1",
		},
		countText: {
			textStyle: "sm",
			color: "fg.muted",
		},
		status: {
			textStyle: "sm",
			color: "fg.muted",
		},
	},
	defaultVariants: {
		size: "md",
		variant: "outline",
	},
	variants: {
		size: {
			sm: {
				input: { ...withoutPx(input.variants.size.sm), pl: "9", pr: "9" },
			},
			md: {
				input: { ...withoutPx(input.variants.size.md), pl: "10", pr: "10" },
			},
			lg: {
				input: { ...withoutPx(input.variants.size.lg), pl: "11", pr: "11" },
			},
		},
		variant: {
			outline: { input: { ...input.variants.variant.outline } },
			surface: { input: { ...input.variants.variant.surface } },
			subtle: { input: { ...input.variants.variant.subtle } },
		},
	},
});
