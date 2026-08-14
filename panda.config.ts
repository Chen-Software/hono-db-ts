import { defineConfig } from "@pandacss/dev";

/**
 * Panda CSS config for the Honox UI (in /app).
 *
 * Generates the atomic CSS utilities (`css()`, `styled()`, tokens, patterns)
 * into `design-system/` and the stylesheet into `app/style.css` at build/dev
 * time via the Panda vite plugin (see `vite.ui.config.ts`).
 *
 * `outdir` is the repo-root `design-system/` so the app imports
 * `../../design-system/css` from anywhere under `app/`.
 */
export default defineConfig({
	// Entry points Panda scans for `css()`/`styled()` usage. Unit tests are
	// excluded — their sample props (e.g. `<Grid columns={4}>` in
	// grid.unit.test.tsx, `accept="image/*"` in file-upload.unit.test.tsx)
	// generate invalid CSS (numbers serialized as text tokens) and only exist
	// for test assertions, never for production styles.
	include: [
		"app/**/*.{ts,tsx}",
		"!app/**/*.unit.test.{ts,tsx}",
		"!app/**/*.test.{ts,tsx}",
	],
	outdir: "design-system",
	jsxFramework: "react",
	theme: {
		extend: {
			tokens: {
				colors: {
					accent: { value: "#f97316" }, // orange-500
					ink: { value: "#111827" }, // gray-900
					muted: { value: "#6b7280" }, // gray-500
					faint: { value: "#9ca3af" }, // gray-400
					border: { value: "#e5e7eb" }, // gray-200
				},
			},
		},
	},
});
