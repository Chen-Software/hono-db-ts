import { defineSlotRecipe } from "@pandacss/dev";

export const layout = defineSlotRecipe({
	className: "layout",
	slots: [
		"root",
		"body",
		"header",
		"sider",
		"content",
		"footer",
		"mobileNav",
		"mobileNavToggle",
		"mobileNavPanel",
		"mobileNavActions",
	],
	base: {
		root: {
			display: "flex",
			flexDirection: "column",
			flex: "auto",
			minWidth: "0",
			"&[data-has-sider]": {
				flexDirection: "row",
			},
		},
		// Row wrapper rendered around sider + content when a sider is present.
		body: {
			display: "flex",
			flex: "auto",
			minWidth: "0",
		},
		header: {
			flexShrink: "0",
		},
		sider: {
			flexShrink: "0",
		},
		content: {
			flex: "1",
			minWidth: "0",
			minHeight: "0",
		},
		footer: {
			flexShrink: "0",
		},
		// Native <details> disclosure standing in for `sider` below whatever
		// breakpoint `siderHideBelow` hides it at. Hidden by default (`display:
		// none`) — only a `siderHideBelow` variant turns it on, since without
		// that there's no hidden sider content for it to stand in for.
		mobileNav: {
			display: "none",
			borderTopWidth: "1px",
			borderColor: "border",
			// Scoped to `summary svg` (the chevron), not just `svg` — this is a
			// <details> for the whole sider content, which can include its own
			// icons (e.g. a GitHub link), and an unscoped `svg` selector would
			// flip those upside down along with the chevron when opened.
			"& summary svg": {
				transition: "transform 0.2s",
			},
			"&[open] summary svg": {
				transform: "rotate(180deg)",
			},
		},
		mobileNavToggle: {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: "2",
			px: "4",
			py: "3",
			fontSize: "sm",
			fontWeight: "medium",
			cursor: "pointer",
			userSelect: "none",
			listStyle: "none",
			"&::-webkit-details-marker": {
				display: "none",
			},
		},
		mobileNavPanel: {
			maxH: "60vh",
			overflowY: "auto",
			px: "4",
			pb: "4",
		},
		// Optional block (e.g. header links/actions collapsed out of the
		// desktop header below `siderHideBelow`) rendered above the sider
		// content inside the panel, set off by a divider.
		mobileNavActions: {
			display: "flex",
			flexWrap: "wrap",
			alignItems: "center",
			gap: "3",
			pb: "4",
			mb: "4",
			borderBottomWidth: "1px",
			borderColor: "border",
		},
	},
	defaultVariants: {
		siderWidth: "md",
	},
	variants: {
		/** Page-level shells: fill the viewport height. */
		fullHeight: {
			true: {
				root: {
					minHeight: "screen",
				},
			},
		},
		/** Header pins to the top of the page scroll. */
		stickyHeader: {
			true: {
				header: {
					position: "sticky",
					top: "0",
					zIndex: "20",
				},
			},
		},
		/** Sider pins below a sticky header and scrolls its own overflow.
		 * Consumers with a taller header can override `top`/`maxHeight` via
		 * `siderClass` — utility-layer css() always wins over the recipes
		 * layer. */
		stickySider: {
			true: {
				sider: {
					position: "sticky",
					alignSelf: "flex-start",
					top: "6",
					maxHeight: "calc(100vh - 3rem)",
					overflowY: "auto",
				},
			},
		},
		siderWidth: {
			sm: {
				sider: { width: "56" },
			},
			md: {
				sider: { width: "64" },
			},
			lg: {
				sider: { width: "72" },
			},
		},
		/** Hide the sider under the given breakpoint. This also drives
		 * `mobileNav`'s own breakpoint (shown exactly when `sider` is hidden) —
		 * set `mobileNav` on `<Layout>` to render the built-in disclosure
		 * instead of hand-rolling one per page. */
		siderHideBelow: {
			sm: {
				sider: { display: { base: "none", sm: "block" } },
				mobileNav: { display: { base: "block", sm: "none" } },
			},
			md: {
				sider: { display: { base: "none", md: "block" } },
				mobileNav: { display: { base: "block", md: "none" } },
			},
			lg: {
				sider: { display: { base: "none", lg: "block" } },
				mobileNav: { display: { base: "block", lg: "none" } },
			},
		},
	},
});
