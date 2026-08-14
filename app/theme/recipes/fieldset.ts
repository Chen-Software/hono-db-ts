import { defineSlotRecipe } from "@pandacss/dev";

export const fieldset = defineSlotRecipe({
	className: "fieldset",
	slots: [
		"root",
		"content",
		"control",
		"errorText",
		"helperText",
		"legend",
		"requiredIndicator",
	],
	base: {
		root: {
			display: "flex",
			flexDirection: "column",
			gap: "4",
			width: "full",
			_disabled: {
				layerStyle: "disabled",
			},
		},
		content: {
			display: "flex",
			flexDirection: "column",
			gap: "1.5",
		},
		control: {
			display: "flex",
			flexDirection: "column",
			gap: "1.5",
		},
		errorText: {
			color: "error",
			textStyle: "xs",
		},
		helperText: {
			color: "fg.muted",
			textStyle: "xs",
		},
		legend: {
			alignItems: "center",
			color: "fg.default",
			display: "flex",
			fontWeight: "semibold",
			gap: "0.5",
			textStyle: "sm",
		},
		requiredIndicator: {
			color: "colorPalette.solid",
		},
	},
});
