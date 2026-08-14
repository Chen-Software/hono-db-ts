import { defineSlotRecipe } from "@pandacss/dev";

export const ratingGroup = defineSlotRecipe({
	className: "rating-group",
	slots: ["root", "label", "control", "item", "itemIndicator"],
	base: {
		root: {
			display: "flex",
			flexDirection: "column",
			gap: "1.5",
			verticalAlign: "top",
		},
		label: {
			color: "fg.default",
			fontWeight: "medium",
			textAlign: "start",
			textStyle: "label",
			userSelect: "none",
			_disabled: {
				layerStyle: "disabled",
			},
		},
		control: {
			alignItems: "center",
			display: "inline-flex",
			gap: "0.5",
		},
		item: {
			alignItems: "center",
			borderRadius: "xs",
			cursor: "pointer",
			display: "inline-flex",
			justifyContent: "center",
			outline: "none",
			userSelect: "none",
			_focusVisible: {
				focusVisibleRing: "outside",
			},
			_disabled: {
				layerStyle: "disabled",
			},
			"&[data-readonly]": {
				cursor: "default",
			},
		},
		itemIndicator: {
			alignItems: "center",
			display: "inline-flex",
			justifyContent: "center",
			position: "relative",
			"--clip-path": { base: "inset(0 50% 0 0)", _rtl: "inset(0 0 0 50%)" },
			_icon: {
				display: "inline-block",
				flexShrink: 0,
				height: "inherit",
				left: 0,
				position: "absolute",
				top: 0,
				width: "inherit",
			},
			"& [data-bg]": {
				color: "gray.subtle.bg",
			},
			"& [data-fg]": {
				color: "transparent",
				transitionDuration: "fast",
				transitionProperty: "color",
			},
			"&[data-highlighted]:not([data-half])": {
				"& [data-fg]": {
					color: "colorPalette.solid.bg",
				},
			},
			"&[data-half]": {
				"& [data-fg]": {
					clipPath: "var(--clip-path)",
					color: "colorPalette.solid.bg",
				},
			},
		},
	},

	variants: {
		size: {
			xs: { control: { gap: "1" }, itemIndicator: { width: "4", height: "4" } },
			sm: {
				control: { gap: "1.5" },
				itemIndicator: { width: "4.5", height: "4.5" },
			},
			md: { control: { gap: "2" }, itemIndicator: { width: "5", height: "5" } },
			lg: {
				control: { gap: "2" },
				itemIndicator: { width: "5.5", height: "5.5" },
			},
			xl: { control: { gap: "2" }, itemIndicator: { width: "6", height: "6" } },
		},
	},

	defaultVariants: {
		size: "md",
	},
});
