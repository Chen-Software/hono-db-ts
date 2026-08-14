import { defineSlotRecipe } from "@pandacss/dev";

export const collapsible = defineSlotRecipe({
	className: "collapsible",
	slots: ["root", "trigger", "content", "indicator"],
	base: {
		content: {
			overflow: "hidden",
			_open: {
				animationName: "expand-height, fade-in",
				animationDuration: "slow",
			},
			_closed: {
				animationName: "collapse-height, fade-out",
				animationDuration: "normal",
			},
		},
	},
});
