import { defineSlotRecipe } from "@pandacss/dev";

export const drawer = defineSlotRecipe({
	className: "drawer",
	slots: [
		"backdrop",
		"positioner",
		"content",
		"header",
		"body",
		"footer",
		"title",
		"description",
		"closeTrigger",
	],
	base: {
		backdrop: {
			background: "black.a7",
			position: "fixed",
			insetInlineStart: "0",
			top: "0",
			width: "100vw",
			height: "100dvh",
			zIndex: "overlay",
			_open: {
				animationName: "fade-in",
				animationTimingFunction: "emphasized-in",
				animationDuration: "slow",
			},
			_closed: {
				animationName: "fade-out",
				animationTimingFunction: "emphasized-out",
				animationDuration: "normal",
			},
		},
		positioner: {
			display: "flex",
			width: "100vw",
			height: "100dvh",
			position: "fixed",
			insetInlineStart: "0",
			top: "0",
			zIndex: "modal",
			overscrollBehaviorY: "none",
		},
		content: {
			display: "flex",
			flexDirection: "column",
			position: "relative",
			width: "100%",
			outline: 0,
			zIndex: "modal",
			maxH: "100dvh",
			color: "inherit",
			bg: "gray.surface.bg",
			boxShadow: "lg",
			textAlign: "start",
			_open: {
				animationDuration: "slowest",
				animationTimingFunction: "cubic-bezier(0.05, 0.7, 0.1, 1.0)",
			},
			_closed: {
				animationDuration: "normal",
				animationTimingFunction: "cubic-bezier(0.3, 0.0, 0.8, 0.15)",
			},
		},
		header: {
			display: "flex",
			flexDirection: "column",
			gap: "1",
			pt: { base: "4", md: "6" },
			pb: "0",
			px: { base: "4", md: "6" },
			flex: "0",
			textAlign: "start",
			alignItems: "flex-start",
		},
		body: {
			display: "flex",
			flexDirection: "column",
			alignItems: "flex-start",
			flex: "1",
			overflow: "auto",
			py: { base: "4", md: "6" },
			px: { base: "4", md: "6" },
			textAlign: "start",
		},
		footer: {
			display: "flex",
			alignItems: "center",
			justifyContent: "flex-end",
			flex: "0",
			gap: "3",
			pt: { base: "3", md: "4" },
			pb: { base: "4", md: "6" },
			px: { base: "4", md: "6" },
			textAlign: "start",
		},
		title: {
			color: "fg.default",
			fontWeight: "semibold",
			textStyle: "xl",
			textAlign: "start",
		},
		description: {
			color: "fg.muted",
			textStyle: "sm",
			textAlign: "start",
		},
		closeTrigger: {
			pos: "absolute !important",
			top: "4",
			insetEnd: "4",
			zIndex: "modal",
		},
	},
	defaultVariants: {
		placement: "end",
		size: "sm",
	},
	variants: {
		size: {
			xs: {
				content: {
					maxW: "xs",
				},
			},
			sm: {
				content: {
					maxW: "sm",
				},
			},
			md: {
				content: {
					maxW: "md",
				},
			},
			lg: {
				content: {
					maxW: "lg",
				},
			},
			xl: {
				content: {
					maxW: "xl",
				},
			},
			full: {
				content: {
					maxW: "100vw",
					h: "100dvh",
				},
			},
		},
		placement: {
			start: {
				positioner: {
					justifyContent: "flex-start",
					alignItems: "stretch",
				},
				content: {
					// Side drawers span the full viewport height (not just cap at it),
					// so the absolutely-positioned footer below has a full-height
					// `content` (its nearest positioned ancestor, via `position:
					// relative` in base) to pin itself to the bottom of.
					h: "100dvh",
					_open: {
						animationName: {
							base: "slide-from-left-full, fade-in",
							_rtl: "slide-from-right-full, fade-in",
						},
					},
					_closed: {
						animationName: {
							base: "slide-to-left-full, fade-out",
							_rtl: "slide-to-right-full, fade-out",
						},
					},
				},
				// `children` (the Drawer's raw JSX children, as opposed to the
				// `body` prop) renders as a direct sibling of Header/Body/Footer
				// with no `flex: 1` of its own, so a normal-flow footer trails
				// right under short content instead of the overlay's bottom edge.
				// Taking the footer out of flow and anchoring it directly sidesteps
				// that regardless of which of `body`/`children` is used.
				footer: {
					position: "absolute",
					insetInlineStart: "0",
					insetInlineEnd: "0",
					bottom: "0",
					bg: "gray.surface.bg",
					borderTopWidth: "1px",
					borderColor: "border",
				},
				body: {
					// Reserve room so scrolled-to-bottom content isn't hidden behind
					// the now-absolutely-positioned footer.
					pb: "20",
				},
			},
			end: {
				positioner: {
					justifyContent: "flex-end",
					alignItems: "stretch",
				},
				content: {
					h: "100dvh",
					_open: {
						animationName: {
							base: "slide-from-right-full, fade-in",
							_rtl: "slide-from-left-full, fade-in",
						},
					},
					_closed: {
						animationName: {
							base: "slide-to-right-full, fade-out",
							_rtl: "slide-to-left-full, fade-out",
						},
					},
				},
				footer: {
					position: "absolute",
					insetInlineStart: "0",
					insetInlineEnd: "0",
					bottom: "0",
					bg: "gray.surface.bg",
					borderTopWidth: "1px",
					borderColor: "border",
				},
				body: {
					pb: "20",
				},
			},
			top: {
				positioner: {
					justifyContent: "stretch",
					alignItems: "flex-start",
				},
				content: {
					maxW: "100%",
					_open: { animationName: "slide-from-top-full, fade-in" },
					_closed: { animationName: "slide-to-top-full, fade-out" },
				},
			},

			bottom: {
				positioner: {
					justifyContent: "stretch",
					alignItems: "flex-end",
				},
				content: {
					maxW: "100%",
					_open: { animationName: "slide-from-bottom-full, fade-in" },
					_closed: { animationName: "slide-to-bottom-full, fade-out" },
				},
			},
		},
	},
});
