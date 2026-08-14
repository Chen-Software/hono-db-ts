import { defineSlotRecipe } from "@pandacss/dev";

export const tooltip = defineSlotRecipe({
	className: "tooltip",
	slots: ["trigger", "content", "arrow", "arrowTip", "positioner"],
	base: {
		positioner: {
			zIndex: "tooltip",
		},
		content: {
			"--tooltip-bg": "colors.gray.solid.bg",
			bg: "var(--tooltip-bg)",
			color: "gray.solid.fg",
			borderRadius: "l2",
			boxShadow: "sm",
			fontWeight: "semibold",
			position: "relative",
			px: "2",
			py: "1.5",
			textStyle: "xs",
			maxWidth: "xs",
			zIndex: "tooltip",
			_open: {
				animationStyle: "scale-fade-in",
				animationDuration: "fast",
			},
			_closed: {
				animationStyle: "scale-fade-out",
				animationDuration: "faster",
			},
		},
		arrow: {
			"--arrow-size": "sizes.2",
			"--arrow-background": "var(--tooltip-bg)",
			position: "absolute",
			width: "var(--arrow-size)",
			height: "var(--arrow-size)",
			zIndex: "1",
		},
		arrowTip: {
			position: "absolute",
			inset: "0",
			width: "var(--arrow-size)",
			height: "var(--arrow-size)",
			background: "var(--arrow-background)",
			transform: "rotate(45deg)",
			borderTopWidth: "1px",
			borderInlineStartWidth: "1px",
			borderColor: "var(--tooltip-bg)",
		},
	},
});
