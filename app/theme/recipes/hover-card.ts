import { defineSlotRecipe } from "@pandacss/dev";

export const hoverCard = defineSlotRecipe({
	className: "hover-card",
	slots: ["trigger", "positioner", "content", "arrow", "arrowTip"],
	base: {
		positioner: {
			zIndex: "popover",
		},
		content: {
			"--hovercard-bg": "colors.gray.surface.bg",

			bg: "var(--hovercard-bg)",
			borderRadius: "l3",
			borderWidth: "1px",
			borderColor: "gray.surface.border",
			boxShadow: "lg",
			display: "flex",
			flexDirection: "column",
			maxWidth: "80",
			outline: "0",
			padding: "4",
			position: "relative",
			textStyle: "sm",
			transformOrigin: "var(--transform-origin)",
			zIndex: "popover",
			_open: {
				animationStyle: "slide-fade-in",
				animationDuration: "fast",
			},
			_closed: {
				animationStyle: "slide-fade-out",
				animationDuration: "faster",
			},
		},
		arrow: {
			"--arrow-size": "sizes.3",
			"--arrow-background": "var(--hovercard-bg)",
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
			borderTopWidth: "0.5px",
			borderInlineStartWidth: "0.5px",
			borderColor: "border",
		},
	},
});
