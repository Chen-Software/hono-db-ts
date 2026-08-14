import { defineSlotRecipe } from "@pandacss/dev";

export const checkbox = defineSlotRecipe({
	className: "checkbox",
	slots: ["root", "label", "control", "indicator", "group"],
	base: {
		root: {
			display: "inline-flex",
			gap: "2",
			alignItems: "center",
			verticalAlign: "top",
			position: "relative",
			_disabled: {
				layerStyle: "disabled",
			},
		},
		control: {
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			flexShrink: 0,
			borderWidth: "2px",
			borderColor: "transparent",
			borderRadius: "l1",
			cursor: "pointer",
			transitionDuration: "normal",
			transitionProperty: "border-color, background, box-shadow",
			focusVisibleRing: "outside",
			_icon: {
				boxSize: "full",
			},
			_invalid: {
				borderColor: "error",
			},
		},
		label: {
			fontWeight: "medium",
			userSelect: "none",
		},
		indicator: {
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			width: "full",
			height: "full",
		},
		group: {
			display: "flex",
			flexDirection: "column",
			gap: "3",
		},
	},
	defaultVariants: {
		variant: "solid",
		size: "md",
	},
	variants: {
		variant: {
			solid: {
				control: {
					borderColor: "colorPalette.surface.border",
					_checked: {
						bg: "colorPalette.solid.bg",
						borderColor: "colorPalette.solid.bg",
						color: "colorPalette.solid.fg",
					},
					_invalid: {
						background: "error",
					},
				},
			},
			surface: {
				control: {
					bg: "colorPalette.surface.bg",
					borderWidth: "1px",
					borderColor: "colorPalette.surface.border",
					color: "colorPalette.surface.fg",
					_checked: {
						borderColor: "colorPalette.solid.bg",
					},
				},
			},
			subtle: {
				control: {
					bg: "colorPalette.subtle.bg",
					color: "colorPalette.subtle.fg",
					_checked: {
						borderColor: "colorPalette.solid.bg",
					},
				},
			},
			outline: {
				control: {
					borderWidth: "1px",
					borderColor: "colorPalette.outline.border",
					color: "colorPalette.outline.fg",
					_checked: {
						borderColor: "colorPalette.solid.bg",
					},
				},
			},
			plain: {
				control: {
					color: "colorPalette.plain.fg",
				},
			},
		},
		size: {
			sm: {
				root: { gap: "2" },
				label: { textStyle: "sm" },
				control: { boxSize: "4.5", _icon: { boxSize: "3" } },
			},
			md: {
				root: { gap: "3" },
				label: { textStyle: "md" },
				control: { boxSize: "5", _icon: { boxSize: "3.5" } },
			},
			lg: {
				root: { gap: "3" },
				label: { textStyle: "lg" },
				control: { boxSize: "5.5", _icon: { boxSize: "4" } },
			},
		},
	},
});
