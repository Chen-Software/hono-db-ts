import { defineSlotRecipe } from "@pandacss/dev";

export const carousel = defineSlotRecipe({
	className: "carousel",
	slots: [
		"root",
		"itemGroup",
		"item",
		"control",
		"nextTrigger",
		"prevTrigger",
		"indicatorGroup",
		"indicator",
		"autoplayTrigger",
		"progressText",
	],
	base: {
		root: {
			position: "relative",
			display: "flex",
			flexDirection: "column",
			gap: "3",
			width: "full",
			"&[data-orientation=vertical]": {
				flexDirection: "row",
			},
		},
		itemGroup: {
			borderRadius: "l3",
		},
		item: {
			borderRadius: "l3",
			overflow: "hidden",
		},
		control: {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: "3",
			"&[data-orientation=vertical]": {
				flexDirection: "column",
			},
		},
		nextTrigger: {
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			flexShrink: "0",
			boxSize: "9",
			borderRadius: "full",
			borderWidth: "1px",
			borderColor: "gray.outline.border",
			bg: "gray.surface.bg",
			color: "fg.default",
			cursor: "pointer",
			transition: "colors",
			focusVisibleRing: "outside",
			_hover: {
				bg: "gray.plain.bg.hover",
			},
			_disabled: {
				layerStyle: "disabled",
			},
		},
		prevTrigger: {
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			flexShrink: "0",
			boxSize: "9",
			borderRadius: "full",
			borderWidth: "1px",
			borderColor: "gray.outline.border",
			bg: "gray.surface.bg",
			color: "fg.default",
			cursor: "pointer",
			transition: "colors",
			focusVisibleRing: "outside",
			_hover: {
				bg: "gray.plain.bg.hover",
			},
			_disabled: {
				layerStyle: "disabled",
			},
		},
		indicatorGroup: {
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			gap: "2",
			"&[data-orientation=vertical]": {
				flexDirection: "column",
			},
		},
		indicator: {
			appearance: "none",
			padding: "0",
			boxSize: "2",
			borderRadius: "full",
			borderWidth: "0",
			bg: "gray.subtle.bg",
			cursor: "pointer",
			transition: "colors",
			focusVisibleRing: "outside",
			"&[data-current]": {
				bg: "colorPalette.solid.bg",
			},
			"&[data-readonly]": {
				cursor: "default",
			},
		},
		autoplayTrigger: {
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			flexShrink: "0",
			boxSize: "9",
			borderRadius: "full",
			borderWidth: "1px",
			borderColor: "gray.outline.border",
			bg: "gray.surface.bg",
			color: "fg.default",
			cursor: "pointer",
			transition: "colors",
			focusVisibleRing: "outside",
			_hover: {
				bg: "gray.plain.bg.hover",
			},
			"&[data-pressed]": {
				color: "colorPalette.solid.bg",
				borderColor: "colorPalette.solid.bg",
			},
		},
		progressText: {
			textStyle: "sm",
			color: "fg.muted",
		},
	},
	defaultVariants: {
		size: "md",
	},
	variants: {
		size: {
			sm: {
				control: { gap: "2" },
				indicatorGroup: { gap: "1.5" },
				indicator: { boxSize: "1.5" },
				nextTrigger: { boxSize: "8" },
				prevTrigger: { boxSize: "8" },
				autoplayTrigger: { boxSize: "8" },
			},
			md: {
				control: { gap: "3" },
				indicatorGroup: { gap: "2" },
				indicator: { boxSize: "2" },
				nextTrigger: { boxSize: "9" },
				prevTrigger: { boxSize: "9" },
				autoplayTrigger: { boxSize: "9" },
			},
			lg: {
				control: { gap: "4" },
				indicatorGroup: { gap: "2.5" },
				indicator: { boxSize: "2.5" },
				nextTrigger: { boxSize: "10" },
				prevTrigger: { boxSize: "10" },
				autoplayTrigger: { boxSize: "10" },
			},
		},
		// Overlays `control` on top of the item group (bottom-center for
		// horizontal, right-center for vertical) instead of stacking below it —
		// matches park-ui's inline carousel controls example.
		inline: {
			true: {
				control: {
					position: "absolute",
					insetInline: "0",
					bottom: "3",
					mx: "auto",
					width: "fit",
					p: "1.5",
					borderRadius: "full",
					bg: "black.a8",
					"&[data-orientation=vertical]": {
						insetInline: "auto",
						insetBlock: "0",
						right: "3",
						bottom: "auto",
						mx: "0",
						my: "auto",
						height: "fit",
					},
				},
			},
		},
	},
});
