import { defineSlotRecipe } from "@pandacss/dev";

export const toggleGroup = defineSlotRecipe({
	className: "toggle-group",
	slots: ["root", "item"],
	base: {
		root: {
			display: "inline-flex",
			overflow: "hidden",
			position: "relative",
			width: "fit-content",
			_vertical: {
				flexDirection: "column",
			},
		},
		item: {
			alignItems: "center",
			appearance: "none",
			bg: "gray.surface.bg",
			cursor: "pointer",
			display: "inline-flex",
			fontWeight: "semibold",
			justifyContent: "center",
			outline: "none",
			position: "relative",
			transitionDuration: "normal",
			transitionProperty: "background, border-color, color, box-shadow",
			transitionTimingFunction: "default",
			userSelect: "none",
			color: "fg.muted",
			_vertical: {
				width: "full",
			},
			_disabled: {
				color: "fg.subtle",
				cursor: "not-allowed",
				_hover: {
					bg: "gray.surface.bg",
					color: "fg.subtle",
				},
			},
			_hover: {
				bg: "gray.subtle.bg.hover",
				color: "fg.default",
			},
			_on: {
				bg: "gray.subtle.bg.active",
				color: "fg.default",
			},
		},
	},
	defaultVariants: {
		variant: "outline",
		size: "md",
	},
	variants: {
		variant: {
			outline: {
				root: {
					borderWidth: "1px",
					borderRadius: "l2",
					borderColor: "border",
				},
				item: {
					_horizontal: {
						"&:not(:last-child)": {
							borderRightWidth: "1px",
							borderRightColor: "border",
						},
					},
					_vertical: {
						"&:not(:last-child)": {
							borderBottomWidth: "1px",
							borderBottomColor: "border",
						},
					},
				},
			},
			ghost: {
				item: {
					borderRadius: "l2",
					_on: {
						bg: "gray.subtle.bg.active",
					},
				},
			},
		},
		size: {
			sm: {
				item: {
					h: "9",
					minW: "9",
					px: "3",
					fontSize: "sm",
				},
			},
			md: {
				item: {
					h: "10",
					minW: "10",
					px: "3.5",
					fontSize: "sm",
				},
			},
			lg: {
				item: {
					h: "11",
					minW: "11",
					px: "4",
					fontSize: "md",
				},
			},
		},
	},
});
