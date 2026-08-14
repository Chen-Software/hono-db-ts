export const conditions = {
	extend: {
		// Manual override via `document.documentElement.dataset.theme`, set by
		// the boot script in `_renderer.tsx` (falls back to
		// `prefers-color-scheme` there before first paint) and by the
		// Light/Dark/System buttons in the "Appearance" header popover
		// (content/configs*.json's `headerItems`). Kept as plain attribute
		// selectors — not a `prefers-color-scheme` media query — so an
		// explicit choice always wins regardless of the OS setting.
		light: "[data-theme=light] &",
		dark: "[data-theme=dark] &",
		invalid: "&:is(:user-invalid, [data-invalid], [aria-invalid=true])",
		hover: "&:not(:disabled):hover",
		active: "&:not(:disabled):active",
		checked:
			"&:is(:checked, [data-checked], [data-state=checked], [aria-checked=true], [data-state=indeterminate])",
		on: "&:is([data-state=on])",
		pinned: "&:is([data-pinned])",
		highlighted: "&:is([data-highlighted])",
		open: "&:is([data-state=open])",
		closed: "&:is([data-state=closed])",
		_icon: "& :where(svg, [data-part=icon])",
	},
} as const;
