import { defineSlotRecipe } from "@pandacss/dev";

export const card = defineSlotRecipe({
	className: "card",
	slots: [
		"root",
		"header",
		"body",
		"footer",
		"title",
		"description",
		"image",
		"avatar",
		"action",
		"content",
	],
	base: {
		root: {
			borderRadius: "l3",
			display: "flex",
			flexDirection: "column",
			overflow: "visible",
			position: "relative",
			// Subtle default lift so cards read as raised above the page
			// background even in the (most common) `outline`/`subtle` variants —
			// `elevated` overrides this with a heavier `lg` shadow below, and a
			// CMS author can override it per-card via the Box Shadow field
			// (see block-style.ts's `--cms-box-shadow`).
			boxShadow: "md",
			transition: "all 0.2s ease-in-out",
		},
		header: {
			display: "flex",
			flexDirection: "row",
			alignItems: "flex-start",
			gap: "3",
			p: "6",
		},
		content: {
			display: "flex",
			flexDirection: "column",
			gap: "1",
			flex: "1",
		},
		body: {
			display: "flex",
			flex: "1",
			flexDirection: "column",
			gap: "3",
			pb: "6",
			px: "6",
		},
		footer: {
			display: "flex",
			justifyContent: "flex-end",
			gap: "3",
			pb: "6",
			pt: "2",
			px: "6",
		},
		title: {
			textStyle: "lg",
			fontWeight: "semibold",
		},
		description: {
			color: "fg.muted",
			textStyle: "sm",
		},
		image: {
			width: "full",
			objectFit: "cover",
			overflow: "hidden",
			"&:first-child": {
				borderTopRadius: "l3",
			},
			"&:last-child": {
				borderBottomRadius: "l3",
			},
		},
		avatar: {
			flexShrink: 0,
		},
		action: {
			flexShrink: 0,
			ml: "auto",
		},
	},
	defaultVariants: {
		variant: "outline",
		size: "md",
	},
	variants: {
		variant: {
			elevated: {
				root: {
					bg: "gray.surface.bg",
					boxShadow: "lg",
				},
			},
			outline: {
				root: {
					bg: "gray.surface.bg",
					borderWidth: "1px",
				},
			},
			subtle: {
				root: {
					bg: "gray.subtle.bg",
				},
			},
		},
		size: {
			sm: {
				title: { textStyle: "md" },
				description: { textStyle: "xs" },
				header: { p: "4" },
				body: { px: "4", pb: "4" },
				footer: { px: "4", pb: "4" },
			},
			md: {
				title: { textStyle: "lg" },
				description: { textStyle: "sm" },
				header: { p: "6" },
				body: { px: "6", pb: "6" },
				footer: { px: "6", pb: "6" },
			},
			lg: {
				title: { textStyle: "xl" },
				description: { textStyle: "md" },
				header: { p: "8" },
				body: { px: "8", pb: "8" },
				footer: { px: "8", pb: "8" },
			},
		},
		clickable: {
			true: {
				root: {
					cursor: "pointer",
					_hover: {
						borderColor: "border.emphasized",
						bg: "bg.subtle",
					},
					_active: {
						transform: "scale(0.98)",
					},
				},
			},
		},
		selected: {
			true: {
				root: {
					borderColor: "colorPalette.default",
					ringWidth: "1px",
					ringColor: "colorPalette.default",
				},
			},
		},
	},
});
