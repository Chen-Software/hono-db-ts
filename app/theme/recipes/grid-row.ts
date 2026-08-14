import { defineRecipe } from "@pandacss/dev";

const gridRow = defineRecipe({
	className: "grid-row",
	base: {
		display: "flex",
		flexWrap: "wrap",
		boxSizing: "border-box",
	},
	defaultVariants: {
		align: "top",
		justify: "start",
		wrap: true,
	},
	variants: {
		align: {
			top: { alignItems: "flex-start" },
			middle: { alignItems: "center" },
			bottom: { alignItems: "flex-end" },
			stretch: { alignItems: "stretch" },
		},
		justify: {
			start: { justifyContent: "flex-start" },
			end: { justifyContent: "flex-end" },
			center: { justifyContent: "center" },
			"space-around": { justifyContent: "space-around" },
			"space-between": { justifyContent: "space-between" },
			"space-evenly": { justifyContent: "space-evenly" },
		},
		wrap: {
			true: { flexWrap: "wrap" },
			false: { flexWrap: "nowrap" },
		},
	},
});

export { gridRow };
