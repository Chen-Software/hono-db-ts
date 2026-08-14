import { defineSlotRecipe } from "@pandacss/dev";
import { input } from "./input";

export const clipboard = defineSlotRecipe({
	className: "clipboard",
	slots: ["root", "label", "control", "input", "trigger", "indicator"],
	base: {
		root: {
			display: "flex",
			flexDirection: "column",
			alignItems: "flex-start",
			gap: "1.5",
			width: "full",
		},
		label: {
			display: "inline-flex",
			alignItems: "center",
			gap: "1",
			fontWeight: "medium",
			textStyle: "sm",
			color: "fg.default",
		},
		control: {
			"--input-height": "sizes.10",
			display: "flex",
			alignItems: "center",
			gap: "2",
			width: "full",
		},
		input: {
			...input.base,
			flex: "1",
			color: "fg.muted",
			cursor: "default",
			_focusVisible: {
				color: "fg.default",
			},
		},
		trigger: {
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			flexShrink: "0",
			boxSize: "var(--input-height)",
			borderRadius: "l2",
			borderWidth: "1px",
			borderColor: "gray.outline.border",
			bg: "gray.surface.bg",
			color: "fg.muted",
			cursor: "pointer",
			transition: "colors",
			focusVisibleRing: "outside",
			_hover: {
				bg: "gray.plain.bg.hover",
				color: "fg.default",
			},
			_disabled: {
				layerStyle: "disabled",
			},
			"&[data-copied]": {
				color: "colorPalette.solid.bg",
				borderColor: "colorPalette.solid.bg",
			},
		},
		indicator: {
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			_icon: {
				boxSize: "4",
			},
		},
	},
	defaultVariants: {
		size: "md",
	},
	variants: {
		size: {
			sm: {
				control: { "--input-height": "sizes.9" },
				input: { ...input.variants.size.sm },
			},
			md: {
				control: { "--input-height": "sizes.10" },
				input: { ...input.variants.size.md },
			},
			lg: {
				control: { "--input-height": "sizes.11" },
				input: { ...input.variants.size.lg },
			},
		},
	},
});
