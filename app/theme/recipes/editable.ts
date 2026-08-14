import { defineSlotRecipe } from "@pandacss/dev";

export const editable = defineSlotRecipe({
	className: "editable",
	slots: [
		"root",
		"area",
		"label",
		"preview",
		"input",
		"editTrigger",
		"submitTrigger",
		"cancelTrigger",
		"control",
		"helperText",
		"errorText",
		"tagsInput",
		"tagsInputField",
		"tag",
		"tagDeleteTrigger",
	],
	base: {
		root: {
			alignItems: "center",
			display: "inline-flex",
			gap: "1.5",
			position: "relative",
			width: "full",
		},
		preview: {
			alignItems: "center",
			borderRadius: "l2",
			cursor: "default",
			display: "inline-flex",
			transitionDuration: "normal",
			transitionProperty: "common",
			_disabled: {
				userSelect: "none",
			},
			_hover: {
				bg: "gray.plain.bg.hover",
			},
		},
		input: {
			borderRadius: "l2",
			focusRingWidth: "2px",
			focusRing: "inside",
			transitionDuration: "normal",
			transitionProperty: "common",
			width: "full",
			_focusVisible: {
				outlineOffset: "-1px",
			},
		},
		control: {
			alignItems: "center",
			display: "inline-flex",
			gap: "1.5",
		},
		helperText: {
			color: "fg.muted",
			textStyle: "sm",
		},
		errorText: {
			color: "error",
			textStyle: "sm",
		},
		tagsInput: {
			alignItems: "center",
			display: "flex",
			flexWrap: "wrap",
			gap: "1.5",
		},
		tagsInputField: {
			background: "transparent",
			border: "none",
			outline: "none",
			flex: "1",
			minWidth: "16",
			textStyle: "sm",
		},
		tag: {
			alignItems: "center",
			bg: "gray.subtle.bg",
			borderRadius: "l1",
			display: "inline-flex",
			gap: "1",
			px: "2",
			py: "0.5",
			textStyle: "sm",
		},
		tagDeleteTrigger: {
			alignItems: "center",
			borderRadius: "full",
			color: "fg.muted",
			cursor: "pointer",
			display: "inline-flex",
			justifyContent: "center",
			_hover: {
				bg: "gray.subtle.bg.hover",
				color: "fg",
			},
		},
	},
	defaultVariants: {
		size: "md",
		multiline: false,
		combobox: false,
		tags: false,
	},
	variants: {
		multiline: {
			true: {
				root: {
					display: "flex",
					flexDirection: "column",
					alignItems: "stretch",
				},
				preview: {
					display: "block",
					whiteSpace: "pre-wrap",
					wordBreak: "break-word",
				},
				input: {
					whiteSpace: "pre-wrap",
					resize: "vertical",
				},
				control: {
					alignSelf: "flex-start",
				},
			},
			false: {},
		},
		combobox: {
			true: {
				root: { width: "full" },
			},
			false: {},
		},
		tags: {
			true: {
				root: {
					display: "flex",
					flexDirection: "column",
					alignItems: "stretch",
				},
				preview: {
					display: "flex",
					flexWrap: "wrap",
				},
				control: {
					alignSelf: "flex-start",
				},
			},
			false: {},
		},
		size: {
			"2xs": {
				preview: { textStyle: "xs", px: "2", py: "0.5" },
				input: { textStyle: "xs", px: "2", py: "0.5" },
			},
			xs: {
				preview: { textStyle: "sm", px: "2.5", py: "1.5" },
				input: { textStyle: "sm", px: "2.5", py: "1.5" },
			},
			sm: {
				preview: { textStyle: "sm", px: "3", py: "2" },
				input: { textStyle: "sm", px: "3", py: "2" },
			},
			md: {
				preview: { textStyle: "sm", px: "3.5", py: "2.5" },
				input: { textStyle: "sm", px: "3.5", py: "2.5" },
			},
			lg: {
				preview: { textStyle: "md", px: "4", py: "2.5" },
				input: { textStyle: "md", px: "4", py: "2.5" },
			},
		},
	},
});
