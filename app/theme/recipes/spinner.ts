import { defineRecipe } from "@pandacss/dev";

export const spinner = defineRecipe({
	className: "spinner",
	base: {
		animation: "spin 1s linear infinite",
		borderBottomColor: "transparent",
		borderLeftColor: "transparent",
		borderRadius: "full",
		borderRightColor: "currentColor",
		borderTopColor: "currentColor",
		borderWidth: "2px",
		display: "block",
	},
	defaultVariants: {
		size: "md",
	},
	variants: {
		size: {
			xs: {
				boxSize: "3",
				borderWidth: "1.25px",
			},
			sm: {
				boxSize: "4",
				borderWidth: "1.5px",
			},
			md: {
				boxSize: "5",
				borderWidth: "2px",
			},
			lg: {
				boxSize: "6",
				borderWidth: "2px",
			},
			xl: {
				boxSize: "8",
				borderWidth: "3px",
			},
			"2xl": {
				boxSize: "10",
				borderWidth: "4px",
			},
			inherit: {
				boxSize: "inherit",
				borderWidth: "0.125em",
			},
		},
	},
});
